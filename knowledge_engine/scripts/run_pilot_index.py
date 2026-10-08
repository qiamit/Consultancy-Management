#!/usr/bin/env python3
"""
Index the approved BIS representative pilot selection into bis_pilot_representative_v1.

Resumable / idempotent. Never deletes protected collections.
Source PDFs are read-only.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_index \\
    --selection \"$HOME/Library/Application Support/ConsultancyPro/knowledge-index/diagnostics/pilot/pilot_selection_v1_selected.json\" \\
    --i-understand-start-indexing
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.pilot.constants import PILOT_COLLECTION_NAME, PROTECTED_COLLECTIONS
from knowledge_engine.pilot.pipeline import run_pilot_indexing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Index approved BIS pilot PDFs")
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument(
        "--i-understand-start-indexing",
        action="store_true",
        help="Required to start indexing",
    )
    parser.add_argument("--ocr-dpi", type=int, default=200)
    args = parser.parse_args(argv)

    selection = args.selection.expanduser().resolve()
    if not selection.is_file():
        print(f"ERROR: selection file missing: {selection}", file=sys.stderr)
        return 2

    print(f"Selection: {selection}")
    print(f"Target collection: {PILOT_COLLECTION_NAME}")
    print(f"Protected (will not touch): {', '.join(sorted(PROTECTED_COLLECTIONS))}")

    if not args.i_understand_start_indexing:
        print(
            "Indexing NOT started. Pass --i-understand-start-indexing after review.",
            file=sys.stderr,
        )
        return 0

    settings = load_settings()
    if settings.pdf_source_dir is None or settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR / KNOWLEDGE_VECTOR_DB_PATH required", file=sys.stderr)
        return 2

    # Safety: this runner is v1-only; refuse v2 / wrong-sized selections.
    data = json.loads(selection.read_text(encoding="utf-8"))
    n = len(data.get("selected") or [])
    proposed = data.get("proposed_collection")
    if proposed and proposed != PILOT_COLLECTION_NAME:
        print(
            f"ERROR: run_pilot_index is v1-only; got proposed_collection={proposed!r}. "
            "Use knowledge_engine.scripts.run_second_pilot_index for v2.",
            file=sys.stderr,
        )
        return 2
    if n != 40:
        print(
            f"ERROR: v1 pilot indexing expects exactly 40 selected files, found {n}",
            file=sys.stderr,
        )
        return 2
    if PILOT_COLLECTION_NAME in PROTECTED_COLLECTIONS:
        print(
            f"ERROR: {PILOT_COLLECTION_NAME} is protected — refusing re-index. "
            "Use second-pilot v2 runner for new corpora.",
            file=sys.stderr,
        )
        return 2

    metrics = run_pilot_indexing(
        selection_path=selection,
        pdf_source_dir=settings.pdf_source_dir,
        vector_db_path=settings.vector_db_path,
        diagnostics_root=default_diagnostics_dir(settings),
        ocr_dpi=args.ocr_dpi,
    )

    print("=== Pilot indexing finished ===")
    print(f"collection_count={metrics.get('collection_count')}")
    print(f"processed_ok={metrics.get('processed_ok')} failed={metrics.get('failed')}")
    print(f"usable_chunks={metrics.get('usable_chunks_sum')} needs_review={metrics.get('needs_review_chunks_sum')}")
    print(f"wall_seconds={metrics.get('wall_seconds')}")
    print(f"chroma_growth_bytes={metrics.get('chroma_growth_bytes')}")
    out = settings.vector_db_path / "sample_collections" / PILOT_COLLECTION_NAME / "metrics.json"
    print(f"metrics={out}")
    return 0 if int(metrics.get("failed") or 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
