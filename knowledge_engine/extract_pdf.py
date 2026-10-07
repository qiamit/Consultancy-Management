"""
Hybrid page extraction: native PyMuPDF text first, Tesseract OCR fallback.

No embeddings or bulk indexing.
"""

from __future__ import annotations

import io
import json
import re
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import pymupdf as fitz

# Minimum alphanumeric chars to treat native text as usable.
DEFAULT_MIN_NATIVE_CHARS = 40
# Ink coverage below this (after render) → treat as blank / skip OCR.
DEFAULT_BLANK_INK_RATIO = 0.004
DEFAULT_OCR_DPI = 200


@dataclass(frozen=True)
class PageExtract:
    page_number: int  # 1-based PDF page index (not printed folio)
    char_count: int
    text: str
    method: str  # native | ocr | blank_skipped | native_with_warnings
    native_char_count: int = 0
    ocr_char_count: int = 0
    ink_ratio: float | None = None
    render_path: str | None = None
    skipped_reason: str | None = None
    native_text: str | None = None
    ocr_text: str | None = None
    quality_warnings: tuple[str, ...] = ()
    text_quality_status: str | None = None  # pass | warn | fail
    preferred_source: str | None = None  # native | ocr | undecided


@dataclass(frozen=True)
class PdfExtractResult:
    source_path: str
    relative_path: str
    page_count: int
    total_chars: int
    pages_with_text: int
    pages_empty: int
    pages_native: int
    pages_ocr: int
    pages_blank_skipped: int
    extracted_at: str
    ocr_enabled: bool
    pages: list[PageExtract]


def _safe_stem(relative_path: str) -> str:
    stem = Path(relative_path).stem
    cleaned = re.sub(r"[^\w.\-]+", "_", stem, flags=re.UNICODE).strip("._")
    return cleaned[:120] or "sample"


def default_diagnostics_dir(settings) -> Path:
    """Prefer KNOWLEDGE_VECTOR_DB_PATH/diagnostics; fall back to module/diagnostics."""
    if settings.vector_db_path is not None:
        return settings.vector_db_path / "diagnostics"
    return settings.module_root / "diagnostics"


def _alnum_count(text: str) -> int:
    return sum(1 for ch in text if ch.isalnum())


def _ensure_tesseract_available() -> str:
    """Return tesseract binary path or raise a clear error."""
    which = shutil.which("tesseract")
    if which:
        return which
    # Common Homebrew locations (Apple Silicon / Intel).
    for candidate in (
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
    ):
        if Path(candidate).is_file():
            return candidate
    raise RuntimeError(
        "Tesseract OCR binary not found. Install with: brew install tesseract"
    )


def _pixmap_ink_ratio(pix: fitz.Pixmap) -> float:
    """Fraction of non-near-white pixels (rough blank-page detector)."""
    # Convert to RGB samples if needed.
    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    samples = pix.samples
    n = pix.n  # bytes per pixel
    total = pix.width * pix.height
    if total <= 0:
        return 0.0
    ink = 0
    # Sample every Nth pixel for speed on large pages.
    step = max(1, total // 80_000)
    checked = 0
    for i in range(0, total, step):
        off = i * n
        r, g, b = samples[off], samples[off + 1], samples[off + 2]
        if r < 245 or g < 245 or b < 245:
            ink += 1
        checked += 1
    return ink / max(checked, 1)


def _ocr_pixmap(pix: fitz.Pixmap, *, lang: str = "eng") -> str:
    from PIL import Image
    import pytesseract

    tesseract_cmd = _ensure_tesseract_available()
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    text = pytesseract.image_to_string(img, lang=lang) or ""
    return text


def ocr_png_file(png_path: Path, *, lang: str = "eng") -> str:
    """OCR an existing rendered PNG with project/local Tesseract."""
    from PIL import Image
    import pytesseract

    tesseract_cmd = _ensure_tesseract_available()
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    with Image.open(png_path) as img:
        return pytesseract.image_to_string(img, lang=lang) or ""


def assess_native_text_quality(text: str, *, context: str = "") -> dict:
    """Public wrapper — heuristics only, not accuracy proof."""
    from knowledge_engine.text_quality import analyze_text_quality

    return analyze_text_quality(text, context=context).to_dict()


def extract_pdf_text(pdf_path: Path, *, relative_path: str = "") -> PdfExtractResult:
    """Native-only extraction (no OCR). Kept for simple diagnostics."""
    return extract_pdf_hybrid(
        pdf_path,
        relative_path=relative_path,
        enable_ocr=False,
        render_dir=None,
    )


def extract_pdf_hybrid(
    pdf_path: Path,
    *,
    relative_path: str = "",
    enable_ocr: bool = True,
    render_dir: Path | None = None,
    min_native_chars: int = DEFAULT_MIN_NATIVE_CHARS,
    blank_ink_ratio: float = DEFAULT_BLANK_INK_RATIO,
    ocr_dpi: int = DEFAULT_OCR_DPI,
    ocr_lang: str = "eng",
) -> PdfExtractResult:
    """
    Per page: native text → if low/missing, render + blank check → OCR if needed.
    """
    pdf_path = pdf_path.resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    if render_dir is not None:
        render_dir.mkdir(parents=True, exist_ok=True)

    zoom = ocr_dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pages: list[PageExtract] = []

    with fitz.open(pdf_path) as doc:
        for index, page in enumerate(doc):
            page_number = index + 1
            native = page.get_text("text") or ""
            native_alnum = _alnum_count(native)
            quality = assess_native_text_quality(
                native, context=f"pdf_page_{page_number}"
            )
            q_status = quality.get("text_quality_status") or "pass"
            q_warnings = tuple(quality.get("quality_warnings") or ())

            # Do NOT treat char-count alone as proof of usable text.
            # Garbled / CID / digitization noise → keep native but warn
            # (forced OCR trials are handled by remediation scripts).
            if native_alnum >= min_native_chars and q_status == "pass":
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=len(native),
                        text=native,
                        method="native",
                        native_char_count=len(native),
                        native_text=native,
                        quality_warnings=q_warnings,
                        text_quality_status=q_status,
                        preferred_source="native",
                    )
                )
                continue

            if native_alnum >= min_native_chars and q_status != "pass":
                # Native present but quality-suspicious: still emit native as
                # primary text, flagged for review / OCR trial. Do not skip
                # silently just because char count is high.
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=len(native),
                        text=native,
                        method="native_with_warnings",
                        native_char_count=len(native),
                        native_text=native,
                        quality_warnings=q_warnings,
                        text_quality_status=q_status,
                        preferred_source="undecided",
                    )
                )
                continue

            if not enable_ocr:
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=len(native),
                        text=native,
                        method="native" if native.strip() else "blank_skipped",
                        native_char_count=len(native),
                        skipped_reason=(
                            None
                            if native.strip()
                            else "native_empty_ocr_disabled"
                        ),
                    )
                )
                continue

            pix = page.get_pixmap(matrix=matrix, alpha=False)
            ink = _pixmap_ink_ratio(pix)
            render_path: str | None = None
            if render_dir is not None:
                out = render_dir / f"pdf_page_{page_number:04d}.png"
                pix.save(out.as_posix())
                render_path = str(out)

            # Intentional-blank watermark still has some ink; require very low ink
            # OR OCR that only matches blank boilerplate.
            if ink < blank_ink_ratio:
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=0,
                        text="",
                        method="blank_skipped",
                        native_char_count=len(native),
                        ink_ratio=ink,
                        render_path=render_path,
                        skipped_reason="low_ink_ratio",
                    )
                )
                continue

            ocr_text = _ocr_pixmap(pix, lang=ocr_lang)
            ocr_stripped = ocr_text.strip()
            # Skip intentional blank watermark pages.
            blankish = re.sub(r"\s+", " ", ocr_stripped.lower())
            boilerplate_blank = (
                "intentionally left blank" in blankish
                or "blank page" in blankish
                or blankish in ("", "blank", "this page is blank")
            )
            if boilerplate_blank and _alnum_count(ocr_stripped) < 80:
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=0,
                        text="",
                        method="blank_skipped",
                        native_char_count=len(native),
                        ocr_char_count=len(ocr_text),
                        ink_ratio=ink,
                        render_path=render_path,
                        skipped_reason="intentional_blank_or_empty_ocr",
                    )
                )
                continue

            if _alnum_count(ocr_text) < 8:
                pages.append(
                    PageExtract(
                        page_number=page_number,
                        char_count=0,
                        text="",
                        method="blank_skipped",
                        native_char_count=len(native),
                        ocr_char_count=len(ocr_text),
                        ink_ratio=ink,
                        render_path=render_path,
                        skipped_reason="ocr_near_empty",
                    )
                )
                continue

            pages.append(
                PageExtract(
                    page_number=page_number,
                    char_count=len(ocr_text),
                    text=ocr_text,
                    method="ocr",
                    native_char_count=len(native),
                    ocr_char_count=len(ocr_text),
                    ink_ratio=ink,
                    render_path=render_path,
                    native_text=native,
                    ocr_text=ocr_text,
                    preferred_source="ocr",
                )
            )

    total_chars = sum(p.char_count for p in pages)
    pages_with_text = sum(1 for p in pages if p.char_count > 0)
    return PdfExtractResult(
        source_path=str(pdf_path),
        relative_path=relative_path or pdf_path.name,
        page_count=len(pages),
        total_chars=total_chars,
        pages_with_text=pages_with_text,
        pages_empty=len(pages) - pages_with_text,
        pages_native=sum(
            1 for p in pages if p.method in ("native", "native_with_warnings")
        ),
        pages_ocr=sum(1 for p in pages if p.method == "ocr"),
        pages_blank_skipped=sum(1 for p in pages if p.method == "blank_skipped"),
        extracted_at=datetime.now(timezone.utc).isoformat(),
        ocr_enabled=enable_ocr,
        pages=pages,
    )


def render_pdf_pages_png(
    pdf_path: Path,
    out_dir: Path,
    *,
    page_numbers: list[int] | None = None,
    dpi: int = 150,
) -> list[Path]:
    """Render selected PDF pages (1-based) to PNG. Does not modify the PDF."""
    pdf_path = pdf_path.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    written: list[Path] = []

    with fitz.open(pdf_path) as doc:
        indices = (
            [p - 1 for p in page_numbers]
            if page_numbers
            else list(range(doc.page_count))
        )
        for index in indices:
            if index < 0 or index >= doc.page_count:
                continue
            page = doc.load_page(index)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            out_path = out_dir / f"pdf_page_{index + 1:04d}.png"
            pix.save(out_path.as_posix())
            written.append(out_path)
    return written


def write_extraction_diagnostics(
    result: PdfExtractResult,
    diagnostics_dir: Path,
    *,
    run_stamp: str | None = None,
) -> dict[str, Path]:
    """Save page-wise text + JSON summary under diagnostics_dir."""
    diagnostics_dir.mkdir(parents=True, exist_ok=True)
    stamp = run_stamp or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = f"{_safe_stem(result.relative_path)}__{stamp}"

    pages_dir = diagnostics_dir / f"{base}_pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    combined_path = diagnostics_dir / f"{base}_full.txt"
    summary_path = diagnostics_dir / f"{base}_summary.json"

    combined_parts: list[str] = []
    for page in result.pages:
        page_file = pages_dir / f"page_{page.page_number:04d}.txt"
        meta = (
            f"method={page.method} native_chars={page.native_char_count} "
            f"ocr_chars={page.ocr_char_count}"
        )
        if page.ink_ratio is not None:
            meta += f" ink_ratio={page.ink_ratio:.5f}"
        if page.skipped_reason:
            meta += f" skipped={page.skipped_reason}"
        page_file.write_text(
            f"# {meta}\n{page.text}",
            encoding="utf-8",
        )
        combined_parts.append(
            f"===== PDF PAGE {page.page_number} / {result.page_count} "
            f"(PDF page index, not printed folio) "
            f"({page.char_count} chars, {page.method}) =====\n"
            f"{page.text.rstrip()}\n"
        )

    combined_path.write_text("\n".join(combined_parts).rstrip() + "\n", encoding="utf-8")

    summary = {
        "source_path": result.source_path,
        "relative_path": result.relative_path,
        "page_count": result.page_count,
        "total_chars": result.total_chars,
        "pages_with_text": result.pages_with_text,
        "pages_empty": result.pages_empty,
        "pages_native": result.pages_native,
        "pages_ocr": result.pages_ocr,
        "pages_blank_skipped": result.pages_blank_skipped,
        "ocr_enabled": result.ocr_enabled,
        "extracted_at": result.extracted_at,
        "page_numbering_note": (
            "page_number is the 1-based PDF page index. "
            "Printed folio numbers inside the standard may differ."
        ),
        "pages": [asdict(p) for p in result.pages],
        "outputs": {
            "full_text": combined_path.name,
            "summary_json": summary_path.name,
            "pages_dir": pages_dir.name,
        },
    }
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return {
        "full_text": combined_path,
        "summary_json": summary_path,
        "pages_dir": pages_dir,
        "run_base": Path(base),
    }


def migrate_legacy_module_diagnostics(settings) -> list[Path]:
    """Move knowledge_engine/diagnostics/* into VECTOR_DB/diagnostics if present."""
    legacy = settings.module_root / "diagnostics"
    target = default_diagnostics_dir(settings)
    if not legacy.is_dir() or legacy.resolve() == target.resolve():
        return []
    target.mkdir(parents=True, exist_ok=True)
    moved: list[Path] = []
    for item in sorted(legacy.iterdir()):
        dest = target / item.name
        if dest.exists():
            continue
        shutil.move(str(item), str(dest))
        moved.append(dest)
    try:
        next(legacy.iterdir())
    except StopIteration:
        legacy.rmdir()
    return moved
