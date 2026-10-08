#!/usr/bin/env python3
"""Build a read-only verified Document IS metadata patch plan. Does not apply it."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.pilot.document_identity import normalize_rel_path
from knowledge_engine.pilot.document_identity_review_registry import (
    FORBIDDEN_OVERWRITE_NAMES,
    load_registry,
)
from knowledge_engine.pilot.document_is_metadata_patch_plan import (
    TARGET_COLLECTION,
    plan_verified_document_is_patch,
)

REPORT_ID = "document_is_metadata_patch_plan_v1"


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_chunk_index(chunks_dir: Path, needs_dir: Path) -> dict[str, dict[str, Any]]:
    """sha256 → bundle summary from chunk JSON only. No PDF, no Chroma."""
    by_sha: dict[str, dict[str, Any]] = {}

    def absorb(path: Path, bucket: str) -> None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        sha = (data.get("source_file_hash_sha256") or "").strip().lower()
        if len(sha) != 64:
            for ch in data.get("chunks") or []:
                sha = (ch.get("source_file_hash") or "").strip().lower()
                if len(sha) == 64:
                    break
        if len(sha) != 64:
            return
        rec = by_sha.setdefault(
            sha,
            {
                "sha256": sha,
                "source_relative_path": normalize_rel_path(str(data.get("source_relative_path") or "")),
                "chunk_count": 0,
                "chunk_ids": [],
                "current_is_number": None,
                "buckets": [],
            },
        )
        if bucket not in rec["buckets"]:
            rec["buckets"].append(bucket)
        for ch in data.get("chunks") or []:
            cid = ch.get("chunk_id")
            if cid and cid not in rec["chunk_ids"]:
                rec["chunk_ids"].append(cid)
                rec["chunk_count"] += 1
            if ch.get("is_number") and rec["current_is_number"] is None:
                rec["current_is_number"] = ch.get("is_number")

    if chunks_dir.is_dir():
        for path in chunks_dir.glob("*__chunks.json"):
            absorb(path, "usable_chunks")
    if needs_dir.is_dir():
        for path in needs_dir.glob("*__chunks.json"):
            absorb(path, "needs_review_chunks")
    return by_sha


def _markdown(report: dict[str, Any]) -> str:
    totals = report["totals"]
    lines = [
        f"# {report['report_id']}",
        "",
        f"- Generated: `{report['generated_at']}`",
        "- Applied: **false** (plan only)",
        "- Chroma opened: **false**",
        "- Parent STD proposed: **0**",
        "",
        "## Totals",
        "",
    ]
    for k, v in totals.items():
        lines.append(f"- `{k}`: {v}")
    lines += [
        "",
        "## Before / after example",
        "",
        "```json",
        json.dumps(report["before_after_example"], indent=2, ensure_ascii=False),
        "```",
        "",
        "## Idempotency and rollback",
        "",
    ]
    for step in report["idempotency_and_rollback"]:
        lines.append(f"- {step}")
    lines += ["", "## Proposed mappings", ""]
    for prop in report["plan"]["proposals"]:
        lines += [
            f"### `{prop['sha256'][:12]}` — {prop['proposed_metadata']['is_number']}",
            "",
            f"- Status: `{prop['status']}`",
            f"- Document ID: `{prop['v2_document_id']}`",
            f"- Kind: `{prop['reviewed_document_kind']}`",
            f"- Not full standard text: `{prop['not_full_standard_text']}`",
            f"- Manifest path: `{prop['source_relative_path']}`",
            f"- Aliases: {', '.join(f'`{a}`' for a in prop['source_aliases']) or '—'}",
            f"- Chunks: **{prop['chunk_count']}**",
            f"- Current is_number: `{prop['current_metadata']['is_number']}` "
            f"(verified={prop['current_metadata']['is_number_verified']})",
            f"- Proposed is_number: `{prop['proposed_metadata']['is_number']}`",
            f"- Folder-role `document_type` left unchanged: "
            f"`{prop['current_metadata']['existing_manifest_document_type_folder_role']}`",
            f"- Flags: {', '.join(prop['flags']) or 'none'}",
            "",
        ]
    lines += ["## Blocked", ""]
    blocked = report["plan"]["blocked"]
    if not blocked:
        lines.append("_None._")
    for item in blocked:
        lines.append(
            f"- `{item.get('sha256','')[:12]}` {item.get('proposed_document_is')} — `{item.get('reason')}`"
        )
    lines += ["", "## Unresolved missing SHA", ""]
    missing = report["plan"]["unresolved_missing_sha"]
    if not missing:
        lines.append("_None._")
    for item in missing:
        lines.append(f"- `{item.get('source_relative_path')}` — {item.get('reason')} (`{item.get('status')}`)")
    lines += ["", "## Manifest alias observation (not a patch)", ""]
    for note in report.get("observations") or []:
        lines.append(f"- {note}")
    lines += ["", "## Constraints", ""]
    for k, v in report["constraints_honored"].items():
        lines.append(f"- `{k}`: {v}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2
    diag = settings.vector_db_path / "diagnostics" / "pilot"
    v2 = settings.vector_db_path / "sample_collections" / TARGET_COLLECTION
    out_json = diag / f"{REPORT_ID}.json"
    out_md = diag / f"{REPORT_ID}.md"
    for path in (out_json, out_md):
        if path.name in FORBIDDEN_OVERWRITE_NAMES or path.exists():
            print(f"ERROR: refusing {path.name}", file=sys.stderr)
            return 2

    registry = load_registry(diag / "document_identity_review_registry_v1.json")
    manifest = json.loads((v2 / "manifest.json").read_text(encoding="utf-8"))
    bundles = _load_chunk_index(v2 / "chunks", v2 / "needs_review_chunks")
    skips_path = diag / "document_identity_review_registry_v1_seed_skips.json"
    skips = json.loads(skips_path.read_text(encoding="utf-8")) if skips_path.is_file() else {}

    plan = plan_verified_document_is_patch(
        registry=registry,
        manifest=manifest,
        chunk_bundles_by_sha=bundles,
        missing_sha_paths=list(skips.get("skipped") or []),
    )
    example = next((p for p in plan["proposals"] if "Part" in (p["proposed_metadata"]["is_number"] or "")), None)
    if example is None and plan["proposals"]:
        example = plan["proposals"][0]
    before_after = None
    if example:
        before_after = {
            "sha256": example["sha256"],
            "before": example["current_metadata"],
            "after": example["proposed_metadata"],
            "parent_std_unchanged": "needs_review / not written",
        }
    observations = []
    # Informational only: missing-sha filename may already be a manifest alias.
    missing_names = {normalize_rel_path(str(s.get("source_relative_path") or "")) for s in skips.get("skipped") or []}
    for rec in (manifest.get("documents") or {}).values():
        aliases = [normalize_rel_path(str(a)) for a in rec.get("source_aliases") or []]
        hit = missing_names.intersection(aliases)
        if hit:
            observations.append(
                "Manifest already lists "
                + ", ".join(f"`{p}`" for p in sorted(hit))
                + f" as alias of sha256 `{str(rec.get('sha256') or '')[:12]}` "
                + f"path `{rec.get('source_relative_path')}`. "
                "No Document IS patch is proposed for that content unless it is verified, "
                "and the missing-hash path stays unmapped in this plan."
            )

    report = {
        "report_id": REPORT_ID,
        "generated_at": _utc(),
        "applied": False,
        "target_collection": TARGET_COLLECTION,
        "totals": plan["totals"],
        "before_after_example": before_after,
        "idempotency_and_rollback": [
            "Apply only when current is_number is empty or already equal to the proposed value.",
            "A second run is a no-op when is_number, is_number_verified, and reviewed_document_kind already match.",
            "Rollback restores is_number=null, is_number_verified=false, and removes reviewed_document_kind.",
            "Do not change manifest document_type; that field is the existing folder role.",
            "Do not write parent_std. Every Parent STD decision is still needs_review.",
            "Write only bis_pilot_representative_v2 manifest and its chunk JSON. Never write v1 collections.",
        ],
        "plan": plan,
        "observations": observations,
        "constraints_honored": {
            "chroma_client_opened": False,
            "metadata_patch_applied": False,
            "pdfs_read": False,
            "ocr_extract_embed_reindex": False,
            "live_filter_api_gold_selection_alias_registry_unchanged": True,
            "git_commit": False,
            "mapping_by_sha256_only": True,
        },
    }
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    out_md.write_text(_markdown(report), encoding="utf-8")
    print(f"wrote={out_json}")
    print(f"wrote_md={out_md}")
    print("totals", json.dumps(plan["totals"]))
    print("chroma_opened=false patch_applied=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
