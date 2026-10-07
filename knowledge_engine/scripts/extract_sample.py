#!/usr/bin/env python3
"""
Extract page-wise text from one PDF under KNOWLEDGE_PDF_SOURCE_DIR.

Diagnostics default: KNOWLEDGE_VECTOR_DB_PATH/diagnostics/

Example:
  knowledge_engine/.venv/bin/python -m knowledge_engine.scripts.extract_sample \\
    "STD 9666/IS 9666 2023 - 00.pdf"
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import (
    default_diagnostics_dir,
    extract_pdf_text,
    migrate_legacy_module_diagnostics,
    render_pdf_pages_png,
    write_extraction_diagnostics,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract page-wise text from a sample BIS PDF (no embeddings/OCR).",
    )
    parser.add_argument(
        "relative_path",
        help='PDF path relative to KNOWLEDGE_PDF_SOURCE_DIR, e.g. "STD 9666/IS 9666 2023 - 00.pdf"',
    )
    parser.add_argument(
        "--diagnostics-dir",
        type=Path,
        default=None,
        help="Output folder (default: KNOWLEDGE_VECTOR_DB_PATH/diagnostics)",
    )
    parser.add_argument(
        "--render-pages",
        default="",
        help='Comma-separated PDF page numbers to PNG, e.g. "1,3,5,8,9,10"',
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=150,
        help="PNG render DPI (default 150)",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.pdf_source_dir is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR is not set in knowledge_engine/.env", file=sys.stderr)
        return 1
    if settings.vector_db_path is None and args.diagnostics_dir is None:
        print(
            "ERROR: KNOWLEDGE_VECTOR_DB_PATH is not set (needed for default diagnostics path)",
            file=sys.stderr,
        )
        return 1

    migrated = migrate_legacy_module_diagnostics(settings)
    for path in migrated:
        print(f"migrated_legacy={path}")

    rel = args.relative_path.strip().lstrip("/").replace("\\", "/")
    pdf_path = (settings.pdf_source_dir / rel).resolve()
    try:
        pdf_path.relative_to(settings.pdf_source_dir)
    except ValueError:
        print(f"ERROR: path escapes source dir: {pdf_path}", file=sys.stderr)
        return 1
    if not pdf_path.is_file():
        print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    diagnostics_dir = (
        args.diagnostics_dir.expanduser().resolve()
        if args.diagnostics_dir
        else default_diagnostics_dir(settings)
    )

    result = extract_pdf_text(pdf_path, relative_path=rel)
    outputs = write_extraction_diagnostics(result, diagnostics_dir)

    render_dir = diagnostics_dir / f"{outputs['run_base'].name}_renders"
    render_pages: list[int] = []
    if args.render_pages.strip():
        for part in args.render_pages.split(","):
            part = part.strip()
            if part:
                render_pages.append(int(part))
    pngs: list[Path] = []
    if render_pages:
        pngs = render_pdf_pages_png(
            pdf_path,
            render_dir,
            page_numbers=render_pages,
            dpi=args.dpi,
        )

    print("extraction_ok")
    print(f"source={result.source_path}")
    print(f"relative_path={result.relative_path}")
    print(f"page_count={result.page_count}")
    print(f"total_chars={result.total_chars}")
    print(f"pages_with_text={result.pages_with_text}")
    print(f"pages_empty={result.pages_empty}")
    print(f"diagnostics_dir={diagnostics_dir}")
    print(f"full_text={outputs['full_text']}")
    print(f"summary_json={outputs['summary_json']}")
    print(f"pages_dir={outputs['pages_dir']}")
    if pngs:
        print(f"renders_dir={render_dir}")
        for png in pngs:
            print(f"render={png}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
