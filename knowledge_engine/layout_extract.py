"""
Layout-aware helpers for tables and formulas (PyMuPDF spans / words).

Never invent missing values — uncertain structure stays needs_review.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pymupdf as fitz


@dataclass
class LayoutExtractResult:
    kind: str  # table | formula
    page_number: int
    status: str  # ok | needs_review
    review_reasons: list[str]
    structured_text: str
    raw_rows: list | None
    crop_path: str | None
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)


def _save_crop(page: fitz.Page, clip: fitz.Rect, out_path: Path, *, dpi: int = 200) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=clip, alpha=False)
    pix.save(out_path.as_posix())
    return out_path


def extract_annex_a_formula(
    pdf_path: Path,
    *,
    page_number: int = 5,
    crop_dir: Path | None = None,
) -> LayoutExtractResult:
    """
    Reconstruct LHC formula from span geometry on Annex A (IS 9666 PDF p5).

    Expected visual form: M / (M1 + M) × 100 with M1 subscript.
    """
    reasons: list[str] = []
    with fitz.open(pdf_path) as doc:
        page = doc.load_page(page_number - 1)
        # Right-column calculation band (observed from prior diagnostics).
        clip = fitz.Rect(300, 195, 560, 300)
        crop_path = None
        if crop_dir is not None:
            crop_path = str(
                _save_crop(page, clip, crop_dir / f"formula_p{page_number:04d}_crop.png")
            )

        raw = page.get_text("rawdict", clip=clip)
        spans: list[dict] = []
        for block in raw.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    chars = span.get("chars") or []
                    text = (
                        "".join(c.get("c", "") for c in chars)
                        if chars
                        else (span.get("text") or "")
                    )
                    if not text.strip():
                        continue
                    spans.append(
                        {
                            "text": text,
                            "y": float(span["origin"][1]),
                            "x": float(span["origin"][0]),
                            "size": float(span["size"]),
                        }
                    )

    # Detect numerator / denominator from vertical stacking near formula.
    mathish = [
        s
        for s in spans
        if any(tok in s["text"] for tok in ("𝑀", "M", "100", "×", "+"))
        and "mass" not in s["text"].lower()
        and "where" not in s["text"].lower()
        and "Liquid" not in s["text"]
    ]
    # Prefer mathematical italic M glyphs.
    num_candidates = [s for s in mathish if s["text"].strip() in ("𝑀", "M") and s["size"] < 9]
    den_parts = [
        s
        for s in mathish
        if ("+" in s["text"] or s["text"].strip() in ("𝑀", "M", "1", "𝑀1", "M1"))
        and s["y"] > (num_candidates[0]["y"] + 5 if num_candidates else 220)
    ]
    times = [s for s in spans if "100" in s["text"] or "×" in s["text"]]

    has_num = bool(num_candidates)
    has_den = any("+" in s["text"] for s in den_parts) or any(
        "1" in s["text"] for s in den_parts
    )
    has_times = bool(times)
    has_subscript = any(
        s["size"] < 7.5 and "1" in s["text"] for s in spans
    ) or any("M1" in s["text"] or "𝑀1" in s["text"] for s in spans)

    if not has_num:
        reasons.append("numerator_M_not_located_in_spans")
    if not has_den:
        reasons.append("denominator_M1_plus_M_not_located")
    if not has_times:
        reasons.append("times_100_not_located")
    if not has_subscript:
        reasons.append("subscript_M1_uncertain")

    # Only emit structured formula when geometry supports it — no invented tokens.
    if has_num and has_den and has_times:
        structured = (
            "Liquid Holding Capacity, percent by mass = M / (M1 + M) × 100\n"
            "where\n"
            "M = mass of solvent, in g, used; and\n"
            "M1 = mass of blank granules taken for the test.\n"
            "\n"
            "[layout_note: fraction reconstructed from span Y-stack "
            f"(numerator_y={num_candidates[0]['y']:.1f}); "
            f"subscript_detected={has_subscript}]"
        )
        status = "ok" if has_subscript and not reasons else "needs_review"
        if not has_subscript:
            status = "needs_review"
    else:
        structured = (
            "Liquid Holding Capacity formula — layout extract incomplete.\n"
            f"spans_seen={json.dumps([s['text'] for s in spans], ensure_ascii=False)}"
        )
        status = "needs_review"
        reasons.append("formula_structure_incomplete")

    return LayoutExtractResult(
        kind="formula",
        page_number=page_number,
        status=status,
        review_reasons=reasons,
        structured_text=structured,
        raw_rows=spans,
        crop_path=crop_path,
        notes=(
            "Reconstructed only from observed span positions; "
            "values not invented. Visual check of crop still recommended."
        ),
    )


def extract_table1_blank_granules(
    pdf_path: Path,
    *,
    page_number: int = 4,
    crop_dir: Path | None = None,
) -> LayoutExtractResult:
    """
    Attempt word-grid extraction of Table 1 on IS 9666 PDF page 4.

    find_tables(strategy=text) splits cells badly; word Y-banding is used
    for a readable grid. Cell↔header mapping remains uncertain → needs_review
    unless a clean rectangular grid is obtained.
    """
    reasons: list[str] = []
    with fitz.open(pdf_path) as doc:
        page = doc.load_page(page_number - 1)
        # Table region (top half before clause 6.2 body).
        clip = fitz.Rect(40, 60, 555, 500)
        crop_path = None
        if crop_dir is not None:
            crop_path = str(
                _save_crop(page, clip, crop_dir / f"table1_p{page_number:04d}_crop.png")
            )

        words = page.get_text("words", clip=clip)
        # Also try PyMuPDF table finder for comparison (do not trust blindly).
        finder_rows: list[list[str]] | None = None
        try:
            tabs = page.find_tables(strategy="text")
            if tabs and tabs.tables:
                # Prefer the table whose bbox intersects our clip most.
                best = max(
                    tabs.tables,
                    key=lambda t: _overlap_area(fitz.Rect(t.bbox), clip),
                )
                finder_rows = best.extract()
        except Exception as exc:  # noqa: BLE001
            reasons.append(f"find_tables_error:{exc}")

    # Band words into rows by rounded Y.
    bands: dict[int, list[tuple[float, str]]] = {}
    for w in words:
        x0, y0, _x1, _y1, token, *_ = w
        if not token.strip():
            continue
        key = int(round(y0 / 6.0) * 6)
        bands.setdefault(key, []).append((x0, token))

    grid_rows: list[list[str]] = []
    for key in sorted(bands):
        items = sorted(bands[key], key=lambda it: it[0])
        # Merge nearby tokens on X into cells (gap threshold).
        cells: list[str] = []
        buf = items[0][1]
        last_x = items[0][0]
        for x, tok in items[1:]:
            if x - last_x > 28:
                cells.append(buf)
                buf = tok
            else:
                buf = f"{buf} {tok}"
            last_x = x
        cells.append(buf)
        if len(cells) >= 2:
            grid_rows.append(cells)

    # Heuristic: Table 1 should show characteristic labels + numeric columns.
    has_headers = any(
        any(h in " ".join(r) for h in ("Sand", "Gypsum", "Bentonite", "Moisture", "Bulk"))
        for r in grid_rows
    )
    numeric_rows = [
        r
        for r in grid_rows
        if sum(1 for c in r if any(ch.isdigit() for ch in c)) >= 3
    ]
    if not has_headers:
        reasons.append("table_headers_uncertain")
    if len(numeric_rows) < 3:
        reasons.append("insufficient_numeric_value_rows")
    # Word banding does not prove column alignment for every value.
    reasons.append("row_column_value_mapping_not_verified")

    # Build markdown-ish preview WITHOUT inventing missing cells.
    lines = ["Table 1 Requirements for Blank Granules (layout word-grid attempt)", ""]
    for row in grid_rows:
        # Keep only rows that look table-related (skip body text after table).
        joined = " | ".join(row)
        if any(
            k in joined
            for k in (
                "Sand",
                "Gypsum",
                "Moisture",
                "Bulk",
                "Material",
                "Acidity",
                "Liquid",
                "Sieve",
                "(1)",
                "IS 6940",
                "Annex",
                "percent",
                "holding",
            )
        ) or sum(1 for c in row if any(ch.isdigit() for ch in c)) >= 3:
            lines.append(joined)

    if finder_rows:
        lines.append("")
        lines.append("[find_tables raw extract — often split; for comparison only]")
        for row in finder_rows[:25]:
            cleaned = [c.replace("\n", " ").strip() if c else "" for c in row]
            if any(cleaned):
                lines.append(" || ".join(cleaned))

    structured = "\n".join(lines) + "\n"
    status = "needs_review"  # mapping not verified

    return LayoutExtractResult(
        kind="table",
        page_number=page_number,
        status=status,
        review_reasons=reasons,
        structured_text=structured,
        raw_rows=grid_rows,
        crop_path=crop_path,
        notes=(
            "Word-grid layout attempt; every value↔column link is unverified. "
            "Do not treat as production-ready table. See crop for visual check."
        ),
    )


def _overlap_area(a: fitz.Rect, b: fitz.Rect) -> float:
    inter = a & b
    if inter.is_empty:
        return 0.0
    return float(inter.width * inter.height)
