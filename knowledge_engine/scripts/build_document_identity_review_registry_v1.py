#!/usr/bin/env python3
"""
Build versioned offline document_identity_review_registry_v1 from existing
human-review packet + v2 chunk artifact hashes (read-only).

Does not overwrite packet, selection, alias policy, gold, or prior reports.
No Chroma / PDF / live / commit.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.pilot.document_identity import normalize_rel_path
from knowledge_engine.pilot.document_identity_review_registry import (
    REGISTRY_ID,
    ReviewRegistryValidationError,
    dump_registry,
    empty_field_annotation,
    filename_is_heuristic,
    new_registry,
    parent_std_from_path,
    rebuild_review_queue_and_summary,
    upsert_content_record,
    upsert_path_occurrence,
    validate_review_registry,
)


def _load_path_hash_index(chunks_dir: Path) -> dict[str, str]:
    """source_relative_path → full sha256 from v2 chunk JSON artifacts only."""
    out: dict[str, str] = {}
    if not chunks_dir.is_dir():
        return out
    for path in chunks_dir.glob("*__chunks.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rel = normalize_rel_path(str(data.get("source_relative_path") or ""))
        sha = (data.get("source_file_hash_sha256") or "").strip().lower()
        if not rel or len(sha) != 64:
            # try first chunk
            for ch in data.get("chunks") or []:
                sha = (ch.get("source_file_hash") or "").strip().lower()
                if len(sha) == 64:
                    break
                rel = rel or normalize_rel_path(
                    str(ch.get("source_relative_path") or "")
                )
        if rel and len(sha) == 64:
            out[rel] = sha
    return out


def _seed_occurrence(
    registry: dict[str, Any],
    *,
    rel: str,
    sha: str,
    document_is_value: str | None,
    document_is_status: str,
    document_is_provenance: str,
    queue_tags: list[str],
    seed_notes: list[str],
) -> None:
    fname = filename_is_heuristic(rel)
    doc_ann = empty_field_annotation(
        status=document_is_status,
        provenance=document_is_provenance,
        value=document_is_value,
    )
    if document_is_value is None and document_is_status == "needs_review":
        doc_ann["notes"] = ["folder-only or missing filename IS — Unverified / needs review"]
    upsert_content_record(registry, sha256=sha, document_is=doc_ann)

    folder, num = parent_std_from_path(rel)
    parent = empty_field_annotation(
        status="unverified" if folder else "needs_review",
        provenance="path_folder_heuristic" if folder else "unavailable",
        value=folder,
    )
    parent["number"] = num
    upsert_path_occurrence(
        registry,
        sha256=sha,
        source_relative_path=rel,
        parent_std=parent,
        filename_is_heuristic_value=fname,
        queue_tags=queue_tags,
        seed_notes=seed_notes,
    )


def seed_from_human_review_packet(
    packet: dict[str, Any],
    *,
    path_to_sha: dict[str, str],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """
    Seed registry from packet rows. Missing hashes become unresolved skip records
    (not written as invalid sha entries).
    """
    reg = new_registry(
        notes=[
            "Seeded from human_review_packet_v2_standard_filter_v1 (read-only).",
            "All Document IS values are heuristic/unverified or needs_review — none verified.",
            "Parent STD from path folder heuristic only.",
        ]
    )
    skipped: list[dict[str, Any]] = []
    seen_paths: set[str] = set()

    def _handle(
        rel_raw: str,
        *,
        doc_is: str | None,
        tags: list[str],
        notes: list[str],
        force_needs_review_doc: bool = False,
    ) -> None:
        rel = normalize_rel_path(rel_raw)
        if not rel or rel in seen_paths:
            return
        sha = path_to_sha.get(rel)
        if not sha:
            skipped.append(
                {
                    "source_relative_path": rel,
                    "reason": "missing_sha256_in_chunk_artifacts",
                    "queue_tags": tags,
                }
            )
            return
        seen_paths.add(rel)
        if force_needs_review_doc or not doc_is:
            _seed_occurrence(
                reg,
                rel=rel,
                sha=sha,
                document_is_value=None if not doc_is else doc_is,
                document_is_status="needs_review",
                document_is_provenance="unavailable" if not doc_is else "filename_heuristic",
                queue_tags=tags,
                seed_notes=notes,
            )
        else:
            _seed_occurrence(
                reg,
                rel=rel,
                sha=sha,
                document_is_value=doc_is,
                document_is_status="unverified",
                document_is_provenance="filename_heuristic",
                queue_tags=tags,
                seed_notes=notes,
            )

    # 1) Answerability FNs
    for row in (packet.get("section_1_false_negatives") or {}).get("records") or []:
        ev = row.get("indexed_evidence") or {}
        rel = ev.get("source_relative_path") or ""
        _handle(
            rel,
            doc_is=row.get("document_is_number"),
            tags=["answerability_fn", "seed_from_review_packet"],
            notes=[f"case_id:{row.get('case_id')}"],
        )

    # 2) Reliability + pilot (may add more paths)
    for section in ("section_1_all_reliability_cases", "section_1_pilot_cases"):
        for row in (packet.get(section) or {}).get("records") or []:
            ev = row.get("indexed_evidence") or {}
            rel = ev.get("source_relative_path") or row.get("source_relative_path") or ""
            _handle(
                rel,
                doc_is=row.get("document_is_number"),
                tags=["eval_case", "seed_from_review_packet"],
                notes=[f"case_id:{row.get('case_id')}", f"section:{section}"],
            )

    # 3) Folder-only ambiguous
    amb = packet.get("ambiguous_or_conflicting_records") or {}
    for row in amb.get("folder_only_selection_paths") or []:
        _handle(
            row.get("source_relative_path") or "",
            doc_is=None,
            tags=["folder_only", "needs_review", "seed_from_review_packet"],
            notes=["folder-only / ambiguous — Unverified / needs review"],
            force_needs_review_doc=True,
        )

    # 4) Proposed unverified (+20) — queue only, not gold
    for row in (packet.get("section_2_proposed_unverified_20") or {}).get("records") or []:
        _handle(
            row.get("source_relative_path") or "",
            doc_is=row.get("document_is_number"),
            tags=["proposed_unverified_plus20", "seed_from_review_packet"],
            notes=[
                f"proposed_id:{row.get('proposed_id')}",
                "not_added_to_authoritative_gold",
            ],
        )

    # 5) Sample conflicts paths
    for row in amb.get("sample_conflicts") or []:
        rel = row.get("source_relative_path") or ""
        _handle(
            rel,
            doc_is=row.get("document_is_number_filename_heuristic")
            or row.get("document_is_number"),
            tags=["filename_vs_parent_conflict", "seed_from_review_packet"],
            notes=["cross-STD or filename vs parent conflict sample"],
        )

    rebuild_review_queue_and_summary(reg)
    validate_review_registry(reg)
    return reg, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-json", type=Path, default=None)
    parser.add_argument(
        "--packet",
        type=Path,
        default=None,
        help="Optional path to human_review_packet JSON",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2

    diag = settings.vector_db_path / "diagnostics" / "pilot"
    packet_path = args.packet or (
        diag / "human_review_packet_v2_standard_filter_v1.json"
    )
    out_json = args.out_json or (diag / f"{REGISTRY_ID}.json")
    chunks_dir = (
        settings.vector_db_path
        / "sample_collections"
        / "bis_pilot_representative_v2"
        / "chunks"
    )

    if not packet_path.is_file():
        print(f"ERROR: missing packet {packet_path}", file=sys.stderr)
        return 2
    if out_json.exists():
        print(f"ERROR: exists {out_json.name} — refusing overwrite", file=sys.stderr)
        return 2

    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    path_to_sha = _load_path_hash_index(chunks_dir)
    registry, skipped = seed_from_human_review_packet(packet, path_to_sha=path_to_sha)

    # Side report for unresolved skips (new file only)
    skip_report = out_json.with_name(
        "document_identity_review_registry_v1_seed_skips.json"
    )
    try:
        dump_registry(out_json, registry)
    except ReviewRegistryValidationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if skip_report.exists():
        print(f"ERROR: exists {skip_report.name}", file=sys.stderr)
        return 2
    skip_report.write_text(
        json.dumps(
            {
                "registry_id": REGISTRY_ID,
                "packet": packet_path.name,
                "skipped_missing_hash_count": len(skipped),
                "skipped": skipped,
                "note": "Paths seen in packet without sha256 in v2 chunk artifacts",
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    stats = validate_review_registry(registry)
    print(f"wrote={out_json}")
    print(f"skip_report={skip_report.name}")
    print(
        "counts",
        json.dumps(
            {
                **stats,
                "unresolved_summary": registry["unresolved_summary"],
                "skipped_missing_hash": len(skipped),
            },
            ensure_ascii=False,
        ),
    )
    print("chroma_opened=false pdf_read=false live_unchanged=true gold_untouched=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
