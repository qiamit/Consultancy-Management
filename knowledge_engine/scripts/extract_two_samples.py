#!/usr/bin/env python3
"""
Two-sample hybrid extraction test (native text → Tesseract OCR fallback).

Examples:
  knowledge_engine/.venv/bin/python -m knowledge_engine.scripts.extract_two_samples
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import (
    default_diagnostics_dir,
    extract_pdf_hybrid,
    migrate_legacy_module_diagnostics,
    write_extraction_diagnostics,
)

DEFAULT_SAMPLES = [
    ("native_text", "STD 9666/IS 9666 2023 - 00.pdf"),
    ("scanned", "STD 21/Test Method/IS 2676 1981 - 00.pdf"),
]


def _prefer_project_tesseract() -> None:
    """Prefer knowledge_engine/.conda tesseract when present."""
    conda_tess = (
        Path(__file__).resolve().parents[1] / ".conda" / "bin" / "tesseract"
    )
    if conda_tess.is_file():
        os.environ["PATH"] = f"{conda_tess.parent}{os.pathsep}{os.environ.get('PATH', '')}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Hybrid extract two BIS sample PDFs (no embeddings).",
    )
    parser.add_argument(
        "--diagnostics-dir",
        type=Path,
        default=None,
        help="Default: KNOWLEDGE_VECTOR_DB_PATH/diagnostics",
    )
    parser.add_argument("--dpi", type=int, default=200, help="OCR render DPI")
    parser.add_argument(
        "--min-native-chars",
        type=int,
        default=40,
        help="Alphanumeric chars required to accept native text",
    )
    args = parser.parse_args(argv)

    _prefer_project_tesseract()

    settings = load_settings()
    if settings.pdf_source_dir is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR unset", file=sys.stderr)
        return 1
    if settings.vector_db_path is None and args.diagnostics_dir is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 1

    for path in migrate_legacy_module_diagnostics(settings):
        print(f"migrated_legacy={path}")

    diagnostics_dir = (
        args.diagnostics_dir.expanduser().resolve()
        if args.diagnostics_dir
        else default_diagnostics_dir(settings)
    )
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    comparison: list[dict] = []

    for label, rel in DEFAULT_SAMPLES:
        pdf_path = (settings.pdf_source_dir / rel).resolve()
        try:
            pdf_path.relative_to(settings.pdf_source_dir)
        except ValueError:
            print(f"ERROR: escapes source dir: {pdf_path}", file=sys.stderr)
            return 1
        if not pdf_path.is_file():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            return 1

        run_base_prefix = f"{label}__"
        # Temporary: extract uses stem from relative path; we nest under label folder.
        sample_dir = diagnostics_dir / f"two_sample_{stamp}" / label
        sample_dir.mkdir(parents=True, exist_ok=True)
        renders_dir = sample_dir / "ocr_renders"

        print(f"=== extracting {label}: {rel} ===")
        result = extract_pdf_hybrid(
            pdf_path,
            relative_path=rel,
            enable_ocr=True,
            render_dir=renders_dir,
            min_native_chars=args.min_native_chars,
            ocr_dpi=args.dpi,
        )
        outputs = write_extraction_diagnostics(result, sample_dir, run_stamp=stamp)

        comparison.append(
            {
                "label": label,
                "relative_path": rel,
                "page_count": result.page_count,
                "total_chars": result.total_chars,
                "pages_with_text": result.pages_with_text,
                "pages_native": result.pages_native,
                "pages_ocr": result.pages_ocr,
                "pages_blank_skipped": result.pages_blank_skipped,
                "full_text": str(outputs["full_text"]),
                "summary_json": str(outputs["summary_json"]),
                "pages_dir": str(outputs["pages_dir"]),
                "renders_dir": str(renders_dir),
            }
        )
        print(
            f"ok pages={result.page_count} chars={result.total_chars} "
            f"native={result.pages_native} ocr={result.pages_ocr} "
            f"blank_skipped={result.pages_blank_skipped}"
        )

    overview = diagnostics_dir / f"two_sample_{stamp}" / "comparison.json"
    overview.write_text(
        json.dumps(
            {
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "tesseract": shutil.which("tesseract"),
                "samples": comparison,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"comparison={overview}")
    print("two_sample_ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
