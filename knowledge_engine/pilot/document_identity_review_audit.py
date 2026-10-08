"""
Read-only integrity audit + reviewer worksheet for document identity registry.

Never auto-sets verified. Does not mutate gold/selection/alias/live systems.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from knowledge_engine.pilot.document_identity import (
    document_id_from_sha256,
    normalize_rel_path,
)
from knowledge_engine.pilot.document_identity_review_registry import (
    FORBIDDEN_OVERWRITE_NAMES,
    REGISTRY_ID,
    SCHEMA_VERSION,
    ReviewRegistryValidationError,
    validate_review_registry,
)

AUDIT_ID = "document_identity_review_registry_v1_integrity_audit"
WORKSHEET_ID = "document_identity_reviewer_worksheet_v1"

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

# Extend protection: do not clobber Phase A registry / packet / this audit once named
_WRITE_PROTECTED = FORBIDDEN_OVERWRITE_NAMES | {
    f"{REGISTRY_ID}.json",
    "document_identity_review_registry_v1_seed_skips.json",
    f"{AUDIT_ID}.json",
    f"{AUDIT_ID}.md",
    f"{WORKSHEET_ID}.json",
    f"{WORKSHEET_ID}.md",
}


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def assert_safe_new_path(path: Path) -> None:
    if path.name in _WRITE_PROTECTED and path.exists():
        raise ReviewRegistryValidationError(
            f"refusing overwrite existing protected/report file: {path.name}"
        )
    if path.name in FORBIDDEN_OVERWRITE_NAMES:
        raise ReviewRegistryValidationError(
            f"refusing protected artifact name: {path.name}"
        )


def collect_packet_paths(packet: dict[str, Any]) -> dict[str, list[str]]:
    """path → packet section tags that referenced it."""
    out: dict[str, list[str]] = defaultdict(list)

    def add(rel: str | None, tag: str) -> None:
        r = normalize_rel_path(rel or "")
        if not r:
            return
        if tag not in out[r]:
            out[r].append(tag)

    for row in (packet.get("section_1_false_negatives") or {}).get("records") or []:
        ev = row.get("indexed_evidence") or {}
        add(ev.get("source_relative_path"), "answerability_fn")
    for section in ("section_1_all_reliability_cases", "section_1_pilot_cases"):
        for row in (packet.get(section) or {}).get("records") or []:
            ev = row.get("indexed_evidence") or {}
            add(ev.get("source_relative_path") or row.get("source_relative_path"), section)
    for row in (packet.get("ambiguous_or_conflicting_records") or {}).get(
        "folder_only_selection_paths"
    ) or []:
        add(row.get("source_relative_path"), "folder_only")
    for row in (packet.get("section_2_proposed_unverified_20") or {}).get("records") or []:
        add(row.get("source_relative_path"), "proposed_unverified_plus20")
    for row in (packet.get("ambiguous_or_conflicting_records") or {}).get(
        "sample_conflicts"
    ) or []:
        add(row.get("source_relative_path"), "sample_conflict")
    return dict(out)


def collect_packet_evidence_by_path(packet: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    """Gather evidence pointers from packet rows keyed by source path."""
    by_path: dict[str, list[dict[str, Any]]] = defaultdict(list)

    def push(rel: str | None, pointer: dict[str, Any]) -> None:
        r = normalize_rel_path(rel or "")
        if not r:
            return
        by_path[r].append(pointer)

    for row in (packet.get("section_1_false_negatives") or {}).get("records") or []:
        ev = row.get("indexed_evidence") or {}
        push(
            ev.get("source_relative_path"),
            {
                "source": "answerability_fn",
                "case_id": row.get("case_id"),
                "chunk_id": ev.get("chunk_id"),
                "clause_number": ev.get("clause_number"),
                "pdf_pages": ev.get("pdf_pages"),
                "review_status": ev.get("review_status"),
                "excerpt_ref": (ev.get("text_excerpt") or "")[:160] or None,
            },
        )
    for section in ("section_1_all_reliability_cases", "section_1_pilot_cases"):
        for row in (packet.get(section) or {}).get("records") or []:
            ev = row.get("indexed_evidence") or {}
            rel = ev.get("source_relative_path") or row.get("source_relative_path")
            push(
                rel,
                {
                    "source": section,
                    "case_id": row.get("case_id"),
                    "chunk_id": ev.get("chunk_id") or row.get("evidence_chunk_id"),
                    "clause_number": ev.get("clause_number") or row.get("evidence_clause"),
                    "pdf_pages": ev.get("pdf_pages") or row.get("evidence_pages"),
                    "review_status": ev.get("review_status") or row.get("evidence_review_status"),
                    "excerpt_ref": (
                        (ev.get("text_excerpt") or row.get("evidence_excerpt") or "")[:160]
                        or None
                    ),
                },
            )
    for row in (packet.get("section_2_proposed_unverified_20") or {}).get("records") or []:
        push(
            row.get("source_relative_path"),
            {
                "source": "proposed_unverified_plus20",
                "proposed_id": row.get("proposed_id"),
                "chunk_id": row.get("evidence_chunk_id"),
                "clause_number": row.get("evidence_clause"),
                "pdf_pages": row.get("evidence_pages"),
                "review_status": row.get("evidence_review_status"),
                "excerpt_ref": (row.get("evidence_excerpt") or "")[:160] or None,
                "note": "proposed_unverified only — not authoritative gold",
            },
        )
    return dict(by_path)


def audit_registry_against_packet(
    registry: dict[str, Any],
    packet: dict[str, Any],
    *,
    seed_skips: dict[str, Any] | None = None,
    path_to_sha_from_chunks: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Read-only integrity audit. Never promotes verified.
    Does not silently merge duplicate hashes — reports mismatches + safe fixes.
    """
    schema_stats = validate_review_registry(registry)
    packet_paths = collect_packet_paths(packet)
    packet_path_set = set(packet_paths.keys())

    contents = list(registry.get("content_records") or [])
    occurrences = list(registry.get("path_occurrences") or [])
    active = [o for o in occurrences if o.get("path_status") == "active"]
    superseded = [o for o in occurrences if o.get("path_status") == "superseded"]

    content_shas = [str(c.get("sha256") or "").lower() for c in contents]
    content_sha_set = set(content_shas)
    active_shas = [str(o.get("sha256") or "").lower() for o in active]
    active_paths = [normalize_rel_path(str(o.get("source_relative_path") or "")) for o in active]

    # --- integrity checks ---
    mismatches: list[dict[str, Any]] = []
    safe_fixes: list[dict[str, Any]] = []

    # unique content hashes
    dup_content = [h for h, n in Counter(content_shas).items() if n > 1]
    if dup_content:
        mismatches.append(
            {
                "code": "duplicate_content_sha256",
                "detail": "content_records must have unique sha256",
                "sha256_list": dup_content,
            }
        )
        safe_fixes.append(
            {
                "code": "dedupe_content_records_by_sha",
                "action": (
                    "Keep one content_record per sha256; merge Document IS only after "
                    "human review if values conflict — do NOT auto-verify or silent-merge."
                ),
            }
        )

    invalid_content_hashes = [h for h in content_shas if not _SHA256_RE.match(h)]
    if invalid_content_hashes:
        mismatches.append(
            {
                "code": "invalid_content_sha256",
                "count": len(invalid_content_hashes),
                "samples": invalid_content_hashes[:5],
            }
        )

    # occurrence → content link
    orphan_occ = []
    for o in occurrences:
        sha = str(o.get("sha256") or "").lower()
        if sha not in content_sha_set:
            orphan_occ.append(
                {
                    "occurrence_id": o.get("occurrence_id"),
                    "sha256": sha,
                    "path": o.get("source_relative_path"),
                }
            )
    if orphan_occ:
        mismatches.append(
            {
                "code": "occurrence_missing_content_record",
                "count": len(orphan_occ),
                "samples": orphan_occ[:10],
            }
        )
        safe_fixes.append(
            {
                "code": "add_missing_content_records",
                "action": (
                    "Insert content_record for each orphan sha with "
                    "document_is status=needs_review provenance=unavailable; "
                    "never mark verified."
                ),
            }
        )

    # content_id consistency
    bad_ids = []
    for c in contents:
        sha = str(c.get("sha256") or "").lower()
        if not _SHA256_RE.match(sha):
            continue
        expected = document_id_from_sha256(sha)
        if c.get("content_id") != expected:
            bad_ids.append({"sha256": sha, "got": c.get("content_id"), "expected": expected})
    if bad_ids:
        mismatches.append({"code": "content_id_mismatch", "samples": bad_ids[:10]})

    # shared-hash multi-path among active
    sha_to_paths: dict[str, list[str]] = defaultdict(list)
    for o in active:
        sha_to_paths[str(o.get("sha256") or "").lower()].append(
            normalize_rel_path(str(o.get("source_relative_path") or ""))
        )
    shared_hash_groups = {
        h: paths for h, paths in sha_to_paths.items() if len(paths) > 1 and _SHA256_RE.match(h)
    }

    # Chunk-observed multi-path groups among packet paths (expected sharing)
    expected_shared: dict[str, list[str]] = {}
    if path_to_sha_from_chunks:
        inv: dict[str, list[str]] = defaultdict(list)
        for p in packet_path_set:
            sha = (path_to_sha_from_chunks.get(p) or "").lower()
            if _SHA256_RE.match(sha):
                inv[sha].append(p)
        expected_shared = {h: ps for h, ps in inv.items() if len(ps) > 1}

        # If chunks say same hash has multiple packet paths, registry must share one content
        for sha, paths in expected_shared.items():
            reg_paths = sha_to_paths.get(sha) or []
            missing = sorted(set(paths) - set(reg_paths))
            extra_contents = sum(1 for c in contents if c.get("sha256") == sha)
            if missing or extra_contents != 1:
                mismatches.append(
                    {
                        "code": "shared_hash_not_single_content_record",
                        "sha256": sha,
                        "chunk_paths": paths,
                        "registry_active_paths": reg_paths,
                        "missing_in_registry": missing,
                        "content_record_count_for_sha": extra_contents,
                    }
                )
                safe_fixes.append(
                    {
                        "code": "link_paths_to_one_content_record",
                        "sha256": sha,
                        "action": (
                            "Ensure exactly one content_record for this sha256; "
                            "add one path_occurrence per path with its own parent_std; "
                            "do NOT duplicate content_records or auto-verify Document IS."
                        ),
                    }
                )

    # Packet coverage
    reg_path_set = set(active_paths)
    in_packet_not_reg = sorted(packet_path_set - reg_path_set)
    in_reg_not_packet = sorted(reg_path_set - packet_path_set)

    skips = list((seed_skips or {}).get("skipped") or [])
    skip_paths = {
        normalize_rel_path(str(s.get("source_relative_path") or "")) for s in skips
    }

    # Skipped paths must not appear as verified anywhere
    verified_leaks = []
    for c in contents:
        doc = c.get("document_is") or {}
        if doc.get("status") == "verified":
            verified_leaks.append(
                {"sha256": c.get("sha256"), "field": "document_is", "value": doc.get("value")}
            )
    for o in occurrences:
        parent = o.get("parent_std") or {}
        if parent.get("status") == "verified":
            verified_leaks.append(
                {
                    "occurrence_id": o.get("occurrence_id"),
                    "field": "parent_std",
                    "value": parent.get("value"),
                }
            )
        if normalize_rel_path(str(o.get("source_relative_path") or "")) in skip_paths:
            mismatches.append(
                {
                    "code": "skipped_path_present_in_registry",
                    "path": o.get("source_relative_path"),
                }
            )

    if verified_leaks:
        mismatches.append(
            {
                "code": "unexpected_verified_annotations",
                "detail": "Integrity audit expects seed registry to have zero verified",
                "samples": verified_leaks[:20],
            }
        )
        safe_fixes.append(
            {
                "code": "revert_verified_to_unverified_or_needs_review",
                "action": (
                    "Demote seed verified rows to unverified/needs_review until "
                    "human_review_with_evidence is recorded in a later review pass."
                ),
            }
        )

    # Explain 44/44 style equality
    unique_valid_active_hashes = sorted(
        {h for h in active_shas if _SHA256_RE.match(h)}
    )
    why_equal = {
        "active_occurrence_count": len(active),
        "content_record_count": len(contents),
        "unique_valid_sha256_among_active": len(unique_valid_active_hashes),
        "shared_hash_multi_path_groups_in_registry": len(shared_hash_groups),
        "shared_hash_multi_path_groups_expected_from_chunks": len(expected_shared),
        "explanation": (
            "Active occurrences equal content records when each seeded path has a "
            "distinct SHA-256 (1:1). That is expected here — not a silent merge. "
            "If chunk artifacts later show the same hash on multiple paths, those "
            "paths must share one content_record with separate path_occurrences; "
            "mismatches are reported above rather than auto-merged."
        ),
        "equals_1_to_1": (
            len(active) == len(contents) == len(unique_valid_active_hashes)
            and len(shared_hash_groups) == 0
        ),
    }

    # Paths in packet not in reg should be exactly skips (or mismatch)
    unexplained_missing = sorted(set(in_packet_not_reg) - skip_paths)
    if unexplained_missing:
        mismatches.append(
            {
                "code": "packet_path_missing_without_skip_record",
                "paths": unexplained_missing,
            }
        )
        safe_fixes.append(
            {
                "code": "add_skip_or_occurrence",
                "action": (
                    "Either add path_occurrence once sha256 is known, or record in "
                    "seed_skips with reason — never invent verified Document IS."
                ),
            }
        )

    for p in in_reg_not_packet:
        mismatches.append(
            {
                "code": "registry_path_not_in_packet",
                "path": p,
                "detail": "Unexpected extra path vs review-packet inputs",
            }
        )

    audit = {
        "audit_id": AUDIT_ID,
        "generated_at": _utc(),
        "read_only": True,
        "auto_verified": False,
        "registry_id": registry.get("registry_id"),
        "schema_version": registry.get("schema_version"),
        "schema_validation": schema_stats,
        "counts": {
            "packet_unique_paths": len(packet_path_set),
            "active_path_occurrences": len(active),
            "superseded_path_occurrences": len(superseded),
            "content_records": len(contents),
            "unique_valid_sha256_content": len(
                {h for h in content_shas if _SHA256_RE.match(h)}
            ),
            "unique_valid_sha256_active_occurrences": len(unique_valid_active_hashes),
            "shared_hash_multi_path_groups": len(shared_hash_groups),
            "skipped_missing_hash_paths": len(skips),
            "packet_paths_missing_from_registry": len(in_packet_not_reg),
            "registry_paths_not_in_packet": len(in_reg_not_packet),
            "mismatch_count": len(mismatches),
            "review_queue_count": len(registry.get("review_queue") or []),
        },
        "why_active_equals_content_records": why_equal,
        "active_path_occurrence_list": [
            {
                "occurrence_id": o.get("occurrence_id"),
                "source_relative_path": o.get("source_relative_path"),
                "sha256": o.get("sha256"),
                "path_status": o.get("path_status"),
                "filename_is_heuristic": o.get("filename_is_heuristic"),
                "parent_std_value": (o.get("parent_std") or {}).get("value"),
                "document_is_status": next(
                    (
                        (c.get("document_is") or {}).get("status")
                        for c in contents
                        if c.get("sha256") == o.get("sha256")
                    ),
                    None,
                ),
                "parent_std_status": (o.get("parent_std") or {}).get("status"),
                "queue_tags": list(o.get("queue_tags") or []),
            }
            for o in sorted(active, key=lambda x: str(x.get("source_relative_path") or ""))
        ],
        "shared_hash_groups_in_registry": [
            {"sha256": h, "paths": paths} for h, paths in sorted(shared_hash_groups.items())
        ],
        "shared_hash_groups_expected_from_chunks": [
            {"sha256": h, "paths": paths} for h, paths in sorted(expected_shared.items())
        ],
        "skipped_missing_hash_paths": skips,
        "skipped_must_not_be_verified": True,
        "packet_paths_missing_from_registry": in_packet_not_reg,
        "registry_paths_not_in_packet": in_reg_not_packet,
        "mismatches": mismatches,
        "suggested_safe_fixes": safe_fixes,
        "verified_annotation_count": len(verified_leaks),
        "integrity_ok": len(mismatches) == 0 and len(verified_leaks) == 0,
        "constraints_honored": {
            "no_auto_verified": True,
            "no_silent_hash_merge": True,
            "packet_selection_alias_gold_untouched": True,
            "chroma_pdf_live_untouched": True,
        },
    }
    return audit


def build_reviewer_worksheet(
    registry: dict[str, Any],
    packet: dict[str, Any],
    *,
    audit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Versioned worksheet with empty reviewer decision fields.
    Seed heuristic values remain labeled unverified/needs_review — never verified.
    """
    validate_review_registry(registry)
    content_by_sha = {c["sha256"]: c for c in registry.get("content_records") or []}
    evidence_by_path = collect_packet_evidence_by_path(packet)
    queue = list(registry.get("review_queue") or [])
    occ_by_id = {
        o["occurrence_id"]: o
        for o in registry.get("path_occurrences") or []
        if o.get("occurrence_id")
    }

    rows: list[dict[str, Any]] = []
    for item in queue:
        oid = item.get("occurrence_id")
        occ = occ_by_id.get(oid) or {}
        if occ.get("path_status") and occ.get("path_status") != "active":
            continue
        sha = str(item.get("sha256") or occ.get("sha256") or "").lower()
        crec = content_by_sha.get(sha) or {}
        doc = dict(crec.get("document_is") or {})
        parent = dict(occ.get("parent_std") or {})
        rel = normalize_rel_path(
            str(item.get("source_relative_path") or occ.get("source_relative_path") or "")
        )
        fname = occ.get("filename_is_heuristic")
        parent_num = parent.get("number")
        conflicts: list[str] = []
        if fname and parent_num:
            m = re.search(r"(\d+)", str(fname))
            if m and m.group(1) != str(parent_num):
                conflicts.append(
                    f"filename_is_heuristic {fname} != parent_std number {parent_num}"
                )
        for reason in item.get("reasons") or []:
            if reason not in conflicts:
                conflicts.append(str(reason))

        # Guard: never copy verified into worksheet seed
        if doc.get("status") == "verified":
            doc = {
                **doc,
                "status": "needs_review",
                "notes": list(doc.get("notes") or [])
                + ["demoted_in_worksheet_seed: was unexpectedly verified"],
            }
        if parent.get("status") == "verified":
            parent = {
                **parent,
                "status": "needs_review",
                "notes": list(parent.get("notes") or [])
                + ["demoted_in_worksheet_seed: was unexpectedly verified"],
            }

        rows.append(
            {
                "occurrence_id": oid,
                "sha256": sha,
                "content_id": crec.get("content_id") or (
                    document_id_from_sha256(sha) if _SHA256_RE.match(sha) else None
                ),
                "source_relative_path": rel,
                "queue_tags": list(item.get("queue_tags") or occ.get("queue_tags") or []),
                "ui_hint": item.get("ui_hint") or "Unverified / needs review",
                "seed_document_is": {
                    "value": doc.get("value"),
                    "status": doc.get("status"),
                    "provenance": doc.get("provenance"),
                    "notes": list(doc.get("notes") or []),
                    "is_verified": False,
                },
                "seed_parent_std": {
                    "value": parent.get("value"),
                    "number": parent.get("number"),
                    "status": parent.get("status"),
                    "provenance": parent.get("provenance"),
                    "notes": list(parent.get("notes") or []),
                    "is_verified": False,
                },
                "filename_is_heuristic": fname,
                "evidence_pointers": evidence_by_path.get(rel) or [],
                "conflicts": conflicts,
                # Empty reviewer fields — no auto decisions
                "reviewer_document_is": {
                    "decision_value": None,
                    "status": None,
                    "provenance": None,
                    "evidence_ref": None,
                    "notes": None,
                },
                "reviewer_parent_std": {
                    "decision_value": None,
                    "status": None,
                    "provenance": None,
                    "evidence_ref": None,
                    "notes": None,
                },
                "reviewer_id": None,
                "reviewed_at": None,
                "worksheet_row_complete": False,
            }
        )

    # Also append skipped missing-hash paths as non-decisionable info rows? User asked them listed separately and not verified.
    skipped_rows = []
    if audit:
        for s in audit.get("skipped_missing_hash_paths") or []:
            skipped_rows.append(
                {
                    "source_relative_path": s.get("source_relative_path"),
                    "reason": s.get("reason"),
                    "queue_tags": s.get("queue_tags") or [],
                    "sha256": None,
                    "seed_document_is_status": "needs_review",
                    "cannot_verify": True,
                    "note": "Missing hash — do not mark verified; resolve hash before occurrence seed.",
                    "reviewer_document_is": {
                        "decision_value": None,
                        "status": None,
                        "provenance": None,
                    },
                    "reviewer_parent_std": {
                        "decision_value": None,
                        "status": None,
                        "provenance": None,
                    },
                }
            )

    return {
        "worksheet_id": WORKSHEET_ID,
        "generated_at": _utc(),
        "registry_id": registry.get("registry_id"),
        "schema_version": SCHEMA_VERSION,
        "purpose": (
            "Human reviewer worksheet: separate Document IS vs Parent STD decisions; "
            "seed values are never verified."
        ),
        "instructions": [
            "Fill reviewer_document_is and reviewer_parent_std independently.",
            "Status may only become verified with human_review_with_evidence + evidence_ref + reviewer_id.",
            "Filename/folder heuristics in seed_* must not be copied as verified.",
            "Skipped/missing-hash paths cannot be verified until sha256 is known.",
            "Do not add proposed_unverified questions to authoritative gold from this sheet alone.",
        ],
        "row_count": len(rows),
        "skipped_missing_hash_row_count": len(skipped_rows),
        "any_seed_marked_verified": False,
        "rows": rows,
        "skipped_missing_hash_rows": skipped_rows,
        "audit_id_ref": (audit or {}).get("audit_id"),
        "constraints_honored": {
            "no_auto_verified": True,
            "gold_selection_alias_untouched": True,
            "live_chroma_untouched": True,
        },
    }


def audit_to_markdown(audit: dict[str, Any]) -> str:
    lines = [
        f"# {audit.get('audit_id')}",
        "",
        f"- Generated: `{audit.get('generated_at')}`",
        f"- Integrity OK: **{audit.get('integrity_ok')}**",
        f"- Auto-verified: **{audit.get('auto_verified')}** (must stay false)",
        "",
        "## Counts",
        "",
    ]
    for k, v in (audit.get("counts") or {}).items():
        lines.append(f"- `{k}`: {v}")
    why = audit.get("why_active_equals_content_records") or {}
    lines += [
        "",
        "## Why active occurrences vs content records",
        "",
        f"- Active occurrences: **{why.get('active_occurrence_count')}**",
        f"- Content records: **{why.get('content_record_count')}**",
        f"- Unique valid SHA-256 (active): **{why.get('unique_valid_sha256_among_active')}**",
        f"- Shared-hash multi-path groups in registry: **{why.get('shared_hash_multi_path_groups_in_registry')}**",
        f"- 1:1 equality: **{why.get('equals_1_to_1')}**",
        "",
        why.get("explanation") or "",
        "",
        "## Skipped / missing-hash paths",
        "",
    ]
    skips = audit.get("skipped_missing_hash_paths") or []
    if not skips:
        lines.append("_None._")
    else:
        for s in skips:
            lines.append(
                f"- `{s.get('source_relative_path')}` — {s.get('reason')} "
                f"(must remain unverified / needs review)"
            )
    lines += ["", "## Mismatches", ""]
    mism = audit.get("mismatches") or []
    if not mism:
        lines.append("_None._")
    else:
        for m in mism:
            lines.append(f"- `{m.get('code')}`: {json.dumps(m, ensure_ascii=False)[:300]}")
    lines += ["", "## Suggested safe fixes (not applied)", ""]
    fixes = audit.get("suggested_safe_fixes") or []
    if not fixes:
        lines.append("_None._")
    else:
        for f in fixes:
            lines.append(f"- `{f.get('code')}`: {f.get('action')}")
    lines += [
        "",
        f"## Active path occurrences ({audit.get('counts', {}).get('active_path_occurrences')})",
        "",
        "| Path | SHA-256 (12) | Document IS status | Parent STD |",
        "|------|--------------|--------------------|------------|",
    ]
    for o in audit.get("active_path_occurrence_list") or []:
        sha = (o.get("sha256") or "")[:12]
        lines.append(
            f"| `{o.get('source_relative_path')}` | `{sha}` | "
            f"{o.get('document_is_status')} | {o.get('parent_std_value')} |"
        )
    lines.append("")
    return "\n".join(lines)


def worksheet_to_markdown(ws: dict[str, Any]) -> str:
    lines = [
        f"# {ws.get('worksheet_id')}",
        "",
        f"- Generated: `{ws.get('generated_at')}`",
        f"- Rows: **{ws.get('row_count')}**",
        f"- Skipped missing-hash: **{ws.get('skipped_missing_hash_row_count')}**",
        f"- Any seed marked verified: **{ws.get('any_seed_marked_verified')}**",
        "",
        "## Instructions",
        "",
    ]
    for i in ws.get("instructions") or []:
        lines.append(f"- {i}")
    lines += [
        "",
        "## Review rows (seed ≠ verified; reviewer fields empty)",
        "",
        "| Path | Seed Document IS | Doc status / prov | Seed Parent STD | Parent status / prov | Conflicts | Reviewer Doc IS | Reviewer Parent STD |",
        "|------|------------------|-------------------|-----------------|----------------------|-----------|-----------------|---------------------|",
    ]
    for r in ws.get("rows") or []:
        doc = r.get("seed_document_is") or {}
        par = r.get("seed_parent_std") or {}
        conflicts = "; ".join(r.get("conflicts") or []) or "—"
        lines.append(
            f"| `{r.get('source_relative_path')}` | {doc.get('value')} | "
            f"{doc.get('status')} / {doc.get('provenance')} | {par.get('value')} | "
            f"{par.get('status')} / {par.get('provenance')} | {conflicts} | `_empty_` | `_empty_` |"
        )
    lines += ["", "## Skipped missing-hash (not verifiable yet)", ""]
    skipped = ws.get("skipped_missing_hash_rows") or []
    if not skipped:
        lines.append("_None._")
    else:
        for s in skipped:
            lines.append(
                f"- `{s.get('source_relative_path')}` — {s.get('reason')} "
                f"(cannot_verify={s.get('cannot_verify')})"
            )
    lines.append("")
    return "\n".join(lines)


def write_json_and_md(path_json: Path, path_md: Path, data: dict[str, Any], md: str) -> None:
    assert_safe_new_path(path_json)
    assert_safe_new_path(path_md)
    if path_json.exists() or path_md.exists():
        raise ReviewRegistryValidationError(
            f"refusing overwrite: {path_json.name} / {path_md.name}"
        )
    path_json.parent.mkdir(parents=True, exist_ok=True)
    path_json.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    path_md.write_text(md, encoding="utf-8")
