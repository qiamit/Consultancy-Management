#!/usr/bin/env python3
"""
Read-only integrity audit + reviewer worksheet for registry v1.

No verified auto-decisions. Does not mutate gold/selection/alias/packet/live/Chroma.
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
from knowledge_engine.pilot.document_identity_review_audit import (
    AUDIT_ID,
    WORKSHEET_ID,
    audit_registry_against_packet,
    audit_to_markdown,
    build_reviewer_worksheet,
    worksheet_to_markdown,
    write_json_and_md,
)
from knowledge_engine.pilot.document_identity_review_registry import (
    REGISTRY_ID,
    ReviewRegistryValidationError,
    load_registry,
)


def _load_path_hash_index(chunks_dir: Path) -> dict[str, str]:
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
            for ch in data.get("chunks") or []:
                sha = (ch.get("source_file_hash") or "").strip().lower()
                if len(sha) == 64:
                    break
                rel = rel or normalize_rel_path(str(ch.get("source_relative_path") or ""))
        if rel and len(sha) == 64:
            out[rel] = sha
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=None)
    parser.add_argument("--packet", type=Path, default=None)
    parser.add_argument("--seed-skips", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=None)
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2

    diag = settings.vector_db_path / "diagnostics" / "pilot"
    out_dir = args.out_dir or diag
    registry_path = args.registry or (diag / f"{REGISTRY_ID}.json")
    packet_path = args.packet or (
        diag / "human_review_packet_v2_standard_filter_v1.json"
    )
    skips_path = args.seed_skips or (
        diag / "document_identity_review_registry_v1_seed_skips.json"
    )
    chunks_dir = (
        settings.vector_db_path
        / "sample_collections"
        / "bis_pilot_representative_v2"
        / "chunks"
    )

    for req in (registry_path, packet_path):
        if not req.is_file():
            print(f"ERROR: missing {req}", file=sys.stderr)
            return 2

    registry = load_registry(registry_path)
    packet = json.loads(packet_path.read_text(encoding="utf-8"))
    seed_skips: dict[str, Any] = {}
    if skips_path.is_file():
        seed_skips = json.loads(skips_path.read_text(encoding="utf-8"))

    # Read-only hash index from existing chunk JSON artifacts (not PDF/Chroma)
    path_to_sha = _load_path_hash_index(chunks_dir)

    audit = audit_registry_against_packet(
        registry,
        packet,
        seed_skips=seed_skips,
        path_to_sha_from_chunks=path_to_sha,
    )
    worksheet = build_reviewer_worksheet(registry, packet, audit=audit)

    audit_json = out_dir / f"{AUDIT_ID}.json"
    audit_md = out_dir / f"{AUDIT_ID}.md"
    ws_json = out_dir / f"{WORKSHEET_ID}.json"
    ws_md = out_dir / f"{WORKSHEET_ID}.md"

    try:
        write_json_and_md(audit_json, audit_md, audit, audit_to_markdown(audit))
        write_json_and_md(ws_json, ws_md, worksheet, worksheet_to_markdown(worksheet))
    except ReviewRegistryValidationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"audit_json={audit_json}")
    print(f"audit_md={audit_md}")
    print(f"worksheet_json={ws_json}")
    print(f"worksheet_md={ws_md}")
    print(
        "summary",
        json.dumps(
            {
                "integrity_ok": audit.get("integrity_ok"),
                "counts": audit.get("counts"),
                "why_1_to_1": (audit.get("why_active_equals_content_records") or {}).get(
                    "equals_1_to_1"
                ),
                "mismatch_count": len(audit.get("mismatches") or []),
                "worksheet_rows": worksheet.get("row_count"),
                "skipped_rows": worksheet.get("skipped_missing_hash_row_count"),
                "any_seed_verified": worksheet.get("any_seed_marked_verified"),
            },
            ensure_ascii=False,
        ),
    )
    print(
        "chroma_opened=false pdf_read=false live_unchanged=true "
        "gold_untouched=true selection_untouched=true alias_untouched=true "
        "auto_verified=false"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
