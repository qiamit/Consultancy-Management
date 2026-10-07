#!/usr/bin/env python3
"""
Build chunks from an existing two_sample diagnostics run (no re-extraction).

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.build_chunks_from_diagnostics \\
    --run-dir "$HOME/Library/Application Support/ConsultancyPro/knowledge-index/diagnostics/two_sample_20261006T142649Z"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.chunk_extract import (
    build_chunks_from_summary,
    sha256_file,
    write_chunks_bundle,
)
from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Chunk existing hybrid extraction diagnostics.")
    parser.add_argument(
        "--run-dir",
        type=Path,
        required=True,
        help="Path to two_sample_* diagnostics folder",
    )
    args = parser.parse_args(argv)

    run_dir = args.run_dir.expanduser().resolve()
    if not run_dir.is_dir():
        print(f"ERROR: run dir not found: {run_dir}", file=sys.stderr)
        return 1

    settings = load_settings()
    if settings.pdf_source_dir is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR unset", file=sys.stderr)
        return 1

    comparison_path = run_dir / "comparison.json"
    comparison = json.loads(comparison_path.read_text(encoding="utf-8"))
    out_root = run_dir / "chunks"
    overview = []

    for sample in comparison["samples"]:
        label = sample["label"]
        rel = sample["relative_path"]
        summary_path = Path(sample["summary_json"])
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
        pdf_path = (settings.pdf_source_dir / rel).resolve()
        file_hash = sha256_file(pdf_path)

        chunks = build_chunks_from_summary(
            summary,
            source_file_hash=file_hash,
            sample_label=label,
        )
        stats = {
            "page_count": summary["page_count"],
            "pages_native": summary.get("pages_native"),
            "pages_ocr": summary.get("pages_ocr"),
            "pages_blank_skipped": summary.get("pages_blank_skipped"),
            "chunks_ok": sum(1 for c in chunks if c.review_status == "ok"),
            "chunks_needs_review": sum(1 for c in chunks if c.review_status == "needs_review"),
            "chunks_with_clause": sum(1 for c in chunks if c.clause_number),
        }
        out = write_chunks_bundle(
            out_dir=out_root,
            sample_label=label,
            relative_path=rel,
            source_file_hash=file_hash,
            chunks=chunks,
            summary_stats=stats,
        )
        overview.append(
            {
                "label": label,
                "relative_path": rel,
                "chunk_count": len(chunks),
                "output": str(out),
                **stats,
            }
        )
        print(f"{label}: chunks={len(chunks)} -> {out}")

    overview_path = out_root / "chunks_overview.json"
    overview_path.write_text(
        json.dumps({"run_dir": str(run_dir), "samples": overview}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    print(f"overview={overview_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
