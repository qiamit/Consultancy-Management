#!/usr/bin/env python3
"""
Read-only SHA-256 duplicate audit for the 150 second-pilot selection paths.

- Hashes local bytes only; refuses cloud/dataless placeholders (no hydration).
- No PDF text extract, OCR, embedding, Chroma, or indexing.
- Does not modify selection / alias policy / source files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import stat as stat_mod
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.pilot.alias_policy import default_policy_path, load_alias_policy
from knowledge_engine.pilot.document_identity import normalize_rel_path
from knowledge_engine.pilot.selection_validate import load_selection_json

UF_DATALESS = getattr(stat_mod, "UF_DATALESS", 0x40000000)

FORBIDDEN_OUT_NAMES = {
    "pilot_selection_v2_selected.json",
    "pilot_selection_v1_selected.json",
    "alias_policy_v1.json",
    "alias_policy_v1_report.md",
    "pilot_selection_v2_report.md",
    "pilot_selection_v1_report.md",
    "second_pilot_plan_v1.json",
    "manifest.json",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _std_folder(rel: str) -> str | None:
    parts = Path(rel).parts
    return parts[0] if parts else None


def check_local_availability(path: Path) -> tuple[bool, str]:
    """
    Non-hydrating local check. Returns (ok, reason).
    Must not open/read file contents.
    """
    try:
        if not path.exists():
            return False, "missing_path"
        if not path.is_file():
            return False, "not_a_file"
        st = path.stat()  # metadata only
    except OSError as exc:
        return False, f"stat_error:{type(exc).__name__}"

    flags = getattr(st, "st_flags", 0) or 0
    if flags & UF_DATALESS:
        return False, "cloud_dataless_placeholder_uf_dataless"
    if st.st_size > 0 and st.st_blocks == 0:
        return False, "cloud_or_sparse_zero_blocks"
    # Extremely under-allocated vs size → likely online-only placeholder
    allocated = st.st_blocks * 512
    if st.st_size >= 64 * 1024 and allocated < max(4096, st.st_size // 100):
        return False, "likely_cloud_under_allocated"
    return True, "local_bytes_present"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def load_v1_manifest_docs(manifest_path: Path | None) -> dict[str, dict[str, Any]]:
    if not manifest_path or not manifest_path.is_file():
        return {}
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    docs = data.get("documents") or {}
    return {normalize_rel_path(k): v for k, v in docs.items() if isinstance(v, dict)}


def recommend_for_new_group(paths: list[str], std_folders: set[str | None]) -> dict[str, Any]:
    """Advisory only — not applied to policy."""
    filenames = [Path(p).name for p in paths]
    same_name = len(set(filenames)) == 1
    cross_std = len({s for s in std_folders if s}) > 1
    if cross_std:
        return {
            "suggested_option": "B_or_C_review_required",
            "rationale": (
                "Same bytes under different STD folders — retain path-specific context; "
                "do not auto-merge as single A without review (cross-STD)."
            ),
            "status": "review_required",
        }
    if same_name is False and len(std_folders) == 1:
        return {
            "suggested_option": "A",
            "rationale": (
                "Same STD folder, filename variants, identical bytes — likely one content "
                "record with source_aliases (Option A). Confirm before applying."
            ),
            "status": "candidate_pending_review",
        }
    return {
        "suggested_option": "C_review_required",
        "rationale": "Ambiguous path/filename pattern; human review required before A/B.",
        "status": "review_required",
    }


def main(argv: list[str] | None = None) -> int:
    base = Path.home() / "Library/Application Support/ConsultancyPro/knowledge-index"
    parser = argparse.ArgumentParser(description="Read-only SHA-256 audit of 150 second-pilot paths")
    parser.add_argument(
        "--selection",
        type=Path,
        default=base / "diagnostics/pilot/pilot_selection_v2_selected.json",
    )
    parser.add_argument(
        "--v1-manifest",
        type=Path,
        default=base / "sample_collections/bis_pilot_representative_v1/manifest.json",
    )
    parser.add_argument(
        "--policy",
        type=Path,
        default=default_policy_path(),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=base / "diagnostics/pilot/second_pilot_sha256_audit_v1.json",
    )
    parser.add_argument(
        "--out-md",
        type=Path,
        default=base / "diagnostics/pilot/second_pilot_sha256_audit_v1.md",
    )
    args = parser.parse_args(argv)

    if args.out.name in FORBIDDEN_OUT_NAMES or args.out_md.name in FORBIDDEN_OUT_NAMES:
        print("ERROR: refusing to overwrite protected artifact name", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"ERROR: report already exists (will not overwrite): {args.out.name}", file=sys.stderr)
        return 2
    if args.out_md.exists():
        print(f"ERROR: report already exists (will not overwrite): {args.out_md.name}", file=sys.stderr)
        return 2

    settings = load_settings()
    if settings.pdf_source_dir is None or not settings.pdf_source_dir.is_dir():
        print("ERROR: pdf source dir not configured or missing", file=sys.stderr)
        return 1
    src_root = settings.pdf_source_dir

    selection = load_selection_json(args.selection)
    rows = selection.get("selected") or []
    paths = [normalize_rel_path(str(r.get("relative_path") or "")) for r in rows]
    distinct = set(paths)

    report: dict[str, Any] = {
        "audit_id": "second_pilot_sha256_audit_v1",
        "generated_at": _utc_now(),
        "mode": "read_only_sha256_audit",
        "selection_id": selection.get("selection_id"),
        "selection_path_count": len(paths),
        "distinct_relative_path_count": len(distinct),
        "pdf_text_extract": False,
        "ocr": False,
        "embedding": False,
        "chroma_accessed": False,
        "indexing_started": False,
        "source_files_modified": False,
        "selection_or_policy_modified": False,
        "absolute_paths_redacted": True,
    }

    if len(paths) != 150:
        report["verdict"] = "FAIL"
        report["fail_reason"] = f"selection_count_not_150:{len(paths)}"
        _write_reports(report, args.out, args.out_md)
        print("FAIL selection_count", len(paths))
        return 1
    if len(distinct) != 150:
        report["verdict"] = "FAIL"
        report["fail_reason"] = "duplicate_relative_paths_in_selection"
        report["duplicate_paths"] = sorted(p for p in distinct if paths.count(p) > 1)
        _write_reports(report, args.out, args.out_md)
        print("FAIL duplicate paths in selection")
        return 1

    # Phase 1: local availability (no content read)
    availability: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []
    by_rel = {normalize_rel_path(str(r["relative_path"])): r for r in rows}
    for rel in paths:
        local_path = src_root / rel
        ok, reason = check_local_availability(local_path)
        size = None
        if ok:
            try:
                size = local_path.stat().st_size
            except OSError:
                ok, reason = False, "stat_error_after_check"
        entry = {
            "relative_path": rel,
            "local_available": ok,
            "reason": reason,
            "size_bytes": size,
            "pilot_wave": by_rel[rel].get("pilot_wave"),
        }
        availability.append(entry)
        if not ok:
            blocked.append(entry)

    report["local_availability"] = {
        "checked": len(availability),
        "local_ok": len(availability) - len(blocked),
        "blocked": blocked,
    }

    if blocked:
        report["verdict"] = "FAIL"
        report["fail_reason"] = "cloud_or_missing_files_no_hydration"
        report["hashing_performed"] = False
        report["note"] = (
            "Audit stopped before any SHA-256 read. Cloud-only/missing paths listed "
            "by relative_path only."
        )
        _write_reports(report, args.out, args.out_md)
        print("FAIL blocked local availability:")
        for b in blocked:
            print(f"  {b['relative_path']}  reason={b['reason']}")
        return 1

    # Phase 2: hash only the 150 local files
    hashes_by_path: dict[str, str] = {}
    hash_to_paths: dict[str, list[str]] = defaultdict(list)
    for rel in paths:
        digest = sha256_file(src_root / rel)
        hashes_by_path[rel] = digest
        hash_to_paths[digest].append(rel)

    unique_contents = len(hash_to_paths)
    multi_groups = {h: ps for h, ps in hash_to_paths.items() if len(ps) > 1}

    # Phase 3: compare with alias policy
    policy = load_alias_policy(args.policy)
    policy_groups = []
    policy_match = []
    policy_mismatch = []
    covered_paths: set[str] = set()
    for g in policy.get("groups") or []:
        gid = g["group_id"]
        expected_sha = (g.get("sha256") or "").lower()
        expected_paths = sorted(normalize_rel_path(p) for p in (g.get("paths") or []))
        covered_paths.update(expected_paths)
        observed_for_paths = {p: hashes_by_path.get(p) for p in expected_paths}
        observed_hashes = {h for h in observed_for_paths.values() if h}
        actual_group_paths = sorted(hash_to_paths.get(expected_sha, []))
        path_set_match = set(expected_paths) == set(actual_group_paths)
        hash_ok = all(observed_for_paths.get(p) == expected_sha for p in expected_paths)
        entry = {
            "group_id": gid,
            "decision_recorded": g.get("decision"),
            "policy_sha256": expected_sha,
            "policy_paths": expected_paths,
            "observed_hashes_by_path": observed_for_paths,
            "hash_match_all_paths": hash_ok,
            "path_membership_match": path_set_match,
            "observed_unique_hashes_among_policy_paths": sorted(observed_hashes),
            "actual_paths_sharing_policy_sha256": actual_group_paths,
        }
        policy_groups.append(entry)
        if hash_ok and path_set_match:
            policy_match.append(gid)
        else:
            policy_mismatch.append(entry)

    # New same-hash groups = multi groups not exactly matching a policy group
    policy_sha_set = {(g.get("sha256") or "").lower() for g in policy.get("groups") or []}
    new_groups = []
    v1_docs = load_v1_manifest_docs(args.v1_manifest if args.v1_manifest.is_file() else None)

    for sha, ps in sorted(multi_groups.items(), key=lambda x: (-len(x[1]), x[0])):
        if sha in policy_sha_set:
            # confirm membership already handled; skip as "new"
            pol = next(g for g in policy.get("groups") or [] if (g.get("sha256") or "").lower() == sha)
            if set(normalize_rel_path(p) for p in pol["paths"]) == set(ps):
                continue
            # membership drift → report as mismatch/newish
        stds = {_std_folder(p) for p in ps}
        members = []
        for p in sorted(ps):
            row = by_rel[p]
            v1 = v1_docs.get(p) or {}
            members.append(
                {
                    "relative_path": p,
                    "filename": Path(p).name,
                    "pilot_wave": row.get("pilot_wave"),
                    "selection_classification": row.get("classification"),
                    "std_folder_heuristic": _std_folder(p),
                    "is_number_from_name_heuristic": row.get("is_number_from_name"),
                    "folder_context_heuristic": row.get("folder_context"),
                    "size_bytes": row.get("size_bytes"),
                    "v1_manifest": {
                        "present": bool(v1),
                        "status": v1.get("status"),
                        "usable_chunk_count": v1.get("usable_chunk_count"),
                        "sample_label": v1.get("sample_label"),
                        "sha256_in_manifest": v1.get("sha256"),
                        "manifest_sha_matches_file": (
                            (v1.get("sha256") or "").lower() == sha if v1.get("sha256") else None
                        ),
                    }
                    if v1
                    else {"present": False},
                    "heuristics_are_verified_document_metadata": False,
                }
            )
        rec = recommend_for_new_group(ps, stds)
        new_groups.append(
            {
                "sha256": sha,
                "path_count": len(ps),
                "std_folders_heuristic": sorted(s for s in stds if s),
                "members": members,
                "recommendation_advisory_only": rec,
                "already_in_alias_policy": sha in policy_sha_set,
            }
        )

    known_extra_slots = sum(len(g["paths"]) - 1 for g in policy.get("groups") or [])
    estimate_137_confirmed = (
        unique_contents == 150 - known_extra_slots
        and len(new_groups) == 0
        and not policy_mismatch
        and len(policy_match) == 7
    )

    report.update(
        {
            "hashing_performed": True,
            "source_path_count": 150,
            "unique_byte_content_count": unique_contents,
            "duplicate_path_rows": [],
            "same_hash_group_count": len(multi_groups),
            "alias_policy_comparison": {
                "policy_id": policy.get("policy_id"),
                "expected_groups": 7,
                "matched_groups": policy_match,
                "mismatched_groups": policy_mismatch,
                "all_seven_match": len(policy_match) == 7 and not policy_mismatch,
            },
            "known_policy_groups_detail": policy_groups,
            "new_same_hash_groups": new_groups,
            "unique_content_estimate_check": {
                "prior_estimate_from_7_groups_only": 137,
                "formula": "150 − sum(len(paths)-1 for 7 policy groups)",
                "known_extra_alias_slots": known_extra_slots,
                "observed_unique_byte_contents": unique_contents,
                "estimate_137_confirmed": estimate_137_confirmed,
                "note": (
                    "137 confirmed only if no additional duplicate hashes exist outside "
                    "the seven known groups and those groups match exactly."
                ),
            },
            "per_path_sha256": [
                {
                    "relative_path": rel,
                    "sha256": hashes_by_path[rel],
                    "pilot_wave": by_rel[rel].get("pilot_wave"),
                }
                for rel in paths
            ],
        }
    )

    if policy_mismatch or new_groups:
        # Still a successful audit measurement; decisions not applied
        if policy_mismatch and not new_groups:
            report["verdict"] = "FAIL"
            report["fail_reason"] = "alias_policy_hash_or_membership_mismatch"
        elif new_groups and not policy_mismatch:
            report["verdict"] = "PASS_WITH_FINDINGS"
            report["findings"] = "new_same_hash_groups_require_review"
        else:
            report["verdict"] = "PASS_WITH_FINDINGS"
            report["findings"] = "policy_mismatch_and_or_new_groups"
    else:
        report["verdict"] = "PASS"
        report["findings"] = None

    report["decisions_applied_to_policy"] = False
    report["awaiting_human_review_for_new_alias_decisions"] = bool(new_groups) or bool(policy_mismatch)

    _write_reports(report, args.out, args.out_md)
    print(f"verdict={report['verdict']}")
    print(f"source_path_count={report['source_path_count']}")
    print(f"unique_byte_content_count={unique_contents}")
    print(f"same_hash_groups={len(multi_groups)}")
    print(f"policy_matched={len(policy_match)}/7")
    print(f"new_same_hash_groups={len(new_groups)}")
    print(f"estimate_137_confirmed={estimate_137_confirmed}")
    print(f"wrote={args.out.name}")
    print(f"wrote_md={args.out_md.name}")
    print("no_ocr_no_chroma_no_index=true")
    return 0 if report["verdict"] in ("PASS", "PASS_WITH_FINDINGS") else 1


def _write_reports(report: dict[str, Any], out_json: Path, out_md: Path) -> None:
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Second-pilot SHA-256 duplicate audit v1",
        "",
        f"- Generated: `{report.get('generated_at')}`",
        f"- Verdict: **{report.get('verdict')}**",
        f"- Source path count: **{report.get('source_path_count') or report.get('selection_path_count')}**",
        f"- Distinct relative paths: **{report.get('distinct_relative_path_count')}**",
        f"- Unique byte-content count: **{report.get('unique_byte_content_count', 'n/a')}**",
        f"- Hashing performed: `{report.get('hashing_performed')}`",
        f"- OCR / extract / embed / Chroma / index: all **false**",
        f"- Selection/policy modified: **false**",
        f"- Absolute paths: redacted",
        "",
    ]
    avail = report.get("local_availability") or {}
    if avail.get("blocked"):
        lines += ["## Blocked (no hydration)", ""]
        for b in avail["blocked"]:
            lines.append(f"- `{b['relative_path']}` — {b['reason']}")
        lines.append("")
    if report.get("hashing_performed"):
        ap = report.get("alias_policy_comparison") or {}
        lines += [
            "## Alias policy comparison",
            "",
            f"- Matched groups: {len(ap.get('matched_groups') or [])}/7",
            f"- All seven match: `{ap.get('all_seven_match')}`",
            "",
            "## Unique-content estimate",
            "",
        ]
        est = report.get("unique_content_estimate_check") or {}
        lines.append(f"- Prior estimate (7 groups only): {est.get('prior_estimate_from_7_groups_only')}")
        lines.append(f"- Observed unique contents: **{est.get('observed_unique_byte_contents')}**")
        lines.append(f"- Estimate 137 confirmed: `{est.get('estimate_137_confirmed')}`")
        lines.append("")
        new_groups = report.get("new_same_hash_groups") or []
        lines += [f"## New same-hash groups ({len(new_groups)})", ""]
        if not new_groups:
            lines.append("_None._")
        for g in new_groups:
            rec = g.get("recommendation_advisory_only") or {}
            lines.append(f"### sha256 `{g['sha256'][:16]}…` ({g['path_count']} paths)")
            lines.append(f"- STD folders (heuristic): {', '.join(g.get('std_folders_heuristic') or [])}")
            lines.append(
                f"- Advisory: **{rec.get('suggested_option')}** "
                f"({rec.get('status')}) — {rec.get('rationale')}"
            )
            for m in g.get("members") or []:
                lines.append(
                    f"  - `{m['relative_path']}` | wave={m.get('pilot_wave')} | "
                    f"name_IS={m.get('is_number_from_name_heuristic')!r} | "
                    f"v1_manifest={m.get('v1_manifest', {}).get('present')}"
                )
            lines.append("")
        lines += [
            "## Note",
            "",
            "Heuristics (STD folder / filename IS) are **not** verified document metadata.",
            "No new A/B decisions were applied to alias-policy or selection.",
            "Awaiting human review before any policy update or indexing.",
            "",
        ]
    out_md.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
