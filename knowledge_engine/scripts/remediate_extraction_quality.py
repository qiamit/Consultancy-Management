#!/usr/bin/env python3
"""
Remediate two-sample extraction quality (no embeddings / bulk indexing).

- Forced OCR trials for IS 2676 pages 4, 7–10
- Hindi OCR trial for IS 9666 cover (if hin lang available)
- Layout-preserving attempts for IS 9666 Table 1 + Annex A formula
- Update only affected pages/chunks; keep prior diagnostics intact

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.remediate_extraction_quality \\
    --prior-run-dir ".../diagnostics/two_sample_20261006T142649Z"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.chunk_extract import (
    build_chunks_from_summary,
    sha256_file,
    sha256_text,
    write_chunks_bundle,
)
from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import (
    _ensure_tesseract_available,
    assess_native_text_quality,
    default_diagnostics_dir,
    ocr_png_file,
    render_pdf_pages_png,
)
from knowledge_engine.layout_extract import (
    extract_annex_a_formula,
    extract_table1_blank_granules,
)
from knowledge_engine.text_quality import analyze_text_quality, list_tesseract_langs


IS_9666 = "STD 9666/IS 9666 2023 - 00.pdf"
IS_2676 = "STD 21/Test Method/IS 2676 1981 - 00.pdf"

# Pages that get forced OCR / layout work in this remediation.
AFFECTED_2676_PAGES = [4, 7, 8, 9, 10]
AFFECTED_9666_COVER = 1
AFFECTED_9666_TABLE = 4
AFFECTED_9666_FORMULA = 5


def _prefer_project_tesseract() -> Path:
    local = Path(__file__).resolve().parents[1] / ".conda" / "bin" / "tesseract"
    if local.is_file():
        import os

        os.environ["PATH"] = f"{local.parent}:{os.environ.get('PATH', '')}"
        return local
    return Path(_ensure_tesseract_available())


def _preview(text: str, n: int = 220) -> str:
    one = " ".join((text or "").split())
    return one[:n] + ("…" if len(one) > n else "")


def _copy_sample_tree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


def _load_summary(sample_dir: Path) -> tuple[Path, dict]:
    path = next(sample_dir.glob("*_summary.json"))
    return path, json.loads(path.read_text(encoding="utf-8"))


def _save_summary(path: Path, summary: dict) -> None:
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _update_page_file(pages_dir: Path, page_number: int, meta: str, text: str) -> None:
    pages_dir.mkdir(parents=True, exist_ok=True)
    (pages_dir / f"page_{page_number:04d}.txt").write_text(
        f"# {meta}\n{text}", encoding="utf-8"
    )


def _page_by_number(summary: dict, page_number: int) -> dict:
    for p in summary["pages"]:
        if int(p["page_number"]) == page_number:
            return p
    raise KeyError(page_number)


def _compare_native_ocr(native: str, ocr: str) -> dict:
    """Heuristic comparison notes — not a declaration that OCR is better."""
    nq = analyze_text_quality(native).to_dict()
    oq = analyze_text_quality(ocr).to_dict()
    notes: list[str] = []
    improved: list[str] = []
    remaining: list[str] = []

    if nq["text_quality_status"] != "pass" and oq["text_quality_status"] == "pass":
        improved.append("ocr_cleared_native_quality_warnings")
    if "DIMI$" in native and "DIMENSION" in ocr.upper():
        improved.append("title_DIMENSIONS_readable_in_ocr")
    if "copyzight" in native.lower() and "copyright" in ocr.lower():
        improved.append("copyright_readable_in_ocr")
    if analyze_text_quality(ocr).suspicious_token_count < analyze_text_quality(native).suspicious_token_count:
        improved.append("fewer_suspicious_tokens_in_ocr")

    # Remaining issues in OCR
    if oq["quality_warnings"]:
        remaining.extend(oq["quality_warnings"])
    if len(ocr.strip()) < 40:
        remaining.append("ocr_too_short")
    # Common OCR residual errors
    for bad in ("O15", "rn ", "cl ", "rn,"):
        if bad in ocr:
            remaining.append(f"possible_ocr_residue:{bad.strip()}")

    notes.append(
        "OCR not auto-declared better; preferred_source=undecided unless "
        "clear title/copyright fixes and OCR quality pass."
    )
    prefer = "undecided"
    if improved and oq["text_quality_status"] in ("pass", "warn") and len(ocr.strip()) > 80:
        # Only prefer OCR when native was clearly failing AND OCR looks cleaner.
        if nq["text_quality_status"] == "fail" and oq["text_quality_status"] == "pass":
            prefer = "ocr"
        else:
            prefer = "undecided"

    return {
        "native_quality": nq,
        "ocr_quality": oq,
        "improved_signals": improved,
        "remaining_issues": remaining,
        "preferred_source": prefer,
        "notes": notes,
    }


def remediate_2676(
    *,
    pdf_path: Path,
    sample_dir: Path,
    summary: dict,
    out_renders: Path,
    dpi: int,
) -> dict:
    out_renders.mkdir(parents=True, exist_ok=True)
    written = render_pdf_pages_png(
        pdf_path, out_renders, page_numbers=AFFECTED_2676_PAGES, dpi=dpi
    )
    pages_dir = sample_dir / summary["outputs"]["pages_dir"]

    trials = []
    for page_number in AFFECTED_2676_PAGES:
        png = out_renders / f"pdf_page_{page_number:04d}.png"
        page = _page_by_number(summary, page_number)
        native = page.get("native_text") or page.get("text") or ""
        ocr = ocr_png_file(png, lang="eng")
        cmp = _compare_native_ocr(native, ocr)

        # Keep both; choose display text carefully without unverified claims.
        preferred = cmp["preferred_source"]
        if preferred == "ocr":
            display = ocr
            method = "ocr_trial_preferred"
        else:
            display = native
            method = "native_with_ocr_trial"

        nq = assess_native_text_quality(display)
        page.update(
            {
                "text": display,
                "char_count": len(display),
                "method": method,
                "native_text": native,
                "ocr_text": ocr,
                "native_char_count": len(native),
                "ocr_char_count": len(ocr),
                "render_path": str(png),
                "quality_warnings": nq.get("quality_warnings") or [],
                "text_quality_status": nq.get("text_quality_status"),
                "preferred_source": preferred,
                "visual_verification_status": "pending",
                "review_reasons": [
                    "forced_ocr_trial_completed",
                    "visual_verification_pending",
                    *(cmp["remaining_issues"][:8]),
                ],
                "ocr_comparison": cmp,
            }
        )
        meta = (
            f"method={method} native_chars={len(native)} ocr_chars={len(ocr)} "
            f"preferred={preferred} visual=pending"
        )
        _update_page_file(pages_dir, page_number, meta, display)
        trials.append(
            {
                "page_number": page_number,
                "render_path": str(png),
                "preferred_source": preferred,
                "native_preview": _preview(native),
                "ocr_preview": _preview(ocr),
                "improved_signals": cmp["improved_signals"],
                "remaining_issues": cmp["remaining_issues"],
                "native_quality": cmp["native_quality"]["text_quality_status"],
                "ocr_quality": cmp["ocr_quality"]["text_quality_status"],
            }
        )

    summary["pages_ocr_trials"] = len(AFFECTED_2676_PAGES)
    return {"pages_ocr_ran": AFFECTED_2676_PAGES, "renders": [str(p) for p in written], "trials": trials}


def remediate_9666_cover(
    *,
    pdf_path: Path,
    sample_dir: Path,
    summary: dict,
    out_renders: Path,
    langs: list[str],
    dpi: int,
) -> dict:
    pages_dir = sample_dir / summary["outputs"]["pages_dir"]
    out_renders.mkdir(parents=True, exist_ok=True)
    hin_available = "hin" in langs
    result: dict = {
        "page_number": AFFECTED_9666_COVER,
        "hin_lang_available": hin_available,
        "ocr_ran": False,
    }
    page = _page_by_number(summary, AFFECTED_9666_COVER)
    native = page.get("native_text") or page.get("text") or ""
    page["native_text"] = native

    render_pdf_pages_png(pdf_path, out_renders, page_numbers=[AFFECTED_9666_COVER], dpi=dpi)
    png = out_renders / f"pdf_page_{AFFECTED_9666_COVER:04d}.png"
    page["render_path"] = str(png)

    if not hin_available:
        nq = assess_native_text_quality(native)
        page.update(
            {
                "method": "native_with_warnings",
                "text_quality_status": nq.get("text_quality_status"),
                "quality_warnings": nq.get("quality_warnings") or [],
                "visual_verification_status": "verified",  # prior cover render inspected
                "preferred_source": "native",
                "review_reasons": [
                    "devanagari_cid_garble",
                    "hindi_tessdata_unavailable",
                ],
            }
        )
        result["note"] = "hin language pack NOT available — Hindi OCR trial skipped"
        return result

    ocr = ocr_png_file(png, lang="hin+eng")
    result["ocr_ran"] = True
    result["ocr_lang"] = "hin+eng"
    cmp = _compare_native_ocr(native, ocr)
    # Check whether OCR recovered विशिष्टि / Blank Granules
    recovered_hindi = "विशिष्टि" in ocr or "विशिष्" in ocr
    recovered_eng = "Blank Granules" in ocr or "Specification" in ocr
    preferred = "undecided"
    display = native
    method = "native_with_ocr_trial"
    reasons = ["hindi_ocr_trial_completed", "cover_visual_verified_prior_render"]
    if recovered_hindi:
        preferred = "ocr"
        display = ocr
        method = "ocr_trial_preferred"
        reasons.append("hindi_title_recovered_in_ocr")
    else:
        reasons.append("hindi_title_not_confirmed_in_ocr")
        if "णिणिणि" in native:
            reasons.append("devanagari_cid_garble_persists_in_native")

    nq = assess_native_text_quality(display)
    # Cover was visually inspected in prior quality review.
    page.update(
        {
            "text": display,
            "char_count": len(display),
            "method": method,
            "ocr_text": ocr,
            "ocr_char_count": len(ocr),
            "quality_warnings": nq.get("quality_warnings") or [],
            "text_quality_status": nq.get("text_quality_status"),
            "preferred_source": preferred,
            "visual_verification_status": "verified",
            "review_reasons": reasons,
            "ocr_comparison": {
                **cmp,
                "recovered_hindi_title": recovered_hindi,
                "recovered_english_title": recovered_eng,
            },
        }
    )
    _update_page_file(
        pages_dir,
        AFFECTED_9666_COVER,
        f"method={method} preferred={preferred} ocr_lang=hin+eng",
        display,
    )
    result.update(
        {
            "preferred_source": preferred,
            "native_preview": _preview(native),
            "ocr_preview": _preview(ocr),
            "recovered_hindi_title": recovered_hindi,
            "recovered_english_title": recovered_eng,
            "render_path": str(png),
        }
    )
    return result


def remediate_9666_layout(
    *,
    pdf_path: Path,
    sample_dir: Path,
    summary: dict,
    crop_dir: Path,
) -> dict:
    pages_dir = sample_dir / summary["outputs"]["pages_dir"]
    crop_dir.mkdir(parents=True, exist_ok=True)

    table = extract_table1_blank_granules(pdf_path, page_number=AFFECTED_9666_TABLE, crop_dir=crop_dir)
    formula = extract_annex_a_formula(pdf_path, page_number=AFFECTED_9666_FORMULA, crop_dir=crop_dir)

    # Persist layout artifacts
    layout_dir = sample_dir / "layout_extracts"
    layout_dir.mkdir(parents=True, exist_ok=True)
    (layout_dir / "table1_layout.json").write_text(
        json.dumps(table.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (layout_dir / "formula_layout.json").write_text(
        json.dumps(formula.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (layout_dir / "table1_layout.txt").write_text(table.structured_text, encoding="utf-8")
    (layout_dir / "formula_layout.txt").write_text(formula.structured_text, encoding="utf-8")

    # Update page 4 — keep native body, attach layout table + crop; needs_review
    p4 = _page_by_number(summary, AFFECTED_9666_TABLE)
    native4 = p4.get("native_text") or p4.get("text") or ""
    p4["native_text"] = native4
    # Append layout attempt; do not invent cleaner table as truth.
    combined4 = (
        native4.rstrip()
        + "\n\n===== LAYOUT_TABLE_ATTEMPT (needs_review) =====\n"
        + table.structured_text
    )
    p4.update(
        {
            "text": combined4,
            "char_count": len(combined4),
            "method": "native_with_layout_attempt",
            "layout_crop_path": table.crop_path,
            "text_quality_status": "warn",
            "quality_warnings": list(
                set((p4.get("quality_warnings") or []) + ["possible_table_scramble"])
            ),
            "visual_verification_status": "pending",
            "review_reasons": table.review_reasons
            + ["table1_layout_mapping_unverified", "visual_verification_pending"],
            "preferred_source": "native",
        }
    )
    _update_page_file(
        pages_dir,
        AFFECTED_9666_TABLE,
        "method=native_with_layout_attempt visual=pending",
        combined4,
    )

    # Update page 5 — replace linearized formula section if structure recovered
    p5 = _page_by_number(summary, AFFECTED_9666_FORMULA)
    native5 = p5.get("native_text") or p5.get("text") or ""
    p5["native_text"] = native5
    if formula.status == "ok":
        # Keep native procedure text; replace calculation block with structured form.
        combined5 = (
            native5.rstrip()
            + "\n\n===== LAYOUT_FORMULA (span-geometry) =====\n"
            + formula.structured_text
        )
        reasons = ["formula_layout_reconstructed_from_spans"]
        tq = "pass"
        # Still needs visual confirm of crop unless we mark pending
        vv = "pending"
        reasons.append("formula_crop_visual_verification_pending")
    else:
        combined5 = (
            native5.rstrip()
            + "\n\n===== LAYOUT_FORMULA_ATTEMPT (needs_review) =====\n"
            + formula.structured_text
        )
        reasons = formula.review_reasons + ["formula_structure_needs_review"]
        tq = "warn"
        vv = "pending"

    p5.update(
        {
            "text": combined5,
            "char_count": len(combined5),
            "method": "native_with_layout_attempt",
            "layout_crop_path": formula.crop_path,
            "text_quality_status": tq,
            "quality_warnings": list(
                set((p5.get("quality_warnings") or []) + (["formula_linearized"] if formula.status != "ok" else []))
            ),
            "visual_verification_status": vv,
            "review_reasons": reasons,
            "preferred_source": "native",
        }
    )
    _update_page_file(
        pages_dir,
        AFFECTED_9666_FORMULA,
        f"method=native_with_layout_attempt formula_status={formula.status}",
        combined5,
    )

    return {
        "table": table.to_dict(),
        "formula": formula.to_dict(),
        "table_status": table.status,
        "formula_status": formula.status,
    }


def _mark_unaffected_visual_pending(summary: dict, affected: set[int], *, label: str) -> None:
    for p in summary["pages"]:
        pn = int(p["page_number"])
        if p.get("method") == "blank_skipped":
            p.setdefault("visual_verification_status", "verified")
            p.setdefault("review_reasons", ["blank_page_confirmed"])
            continue
        if pn in affected:
            continue
        # Unchanged extraction — but review fields must not imply visual ok.
        if "visual_verification_status" not in p:
            # IS 9666 clauses previously spot-checked on prior renders for p3
            if label == "native_text" and pn == 3:
                p["visual_verification_status"] = "verified"
                p.setdefault("review_reasons", ["clause_page_spot_checked_prior_render"])
                nq = assess_native_text_quality(p.get("text") or "")
                p["text_quality_status"] = nq.get("text_quality_status")
                p["quality_warnings"] = nq.get("quality_warnings") or []
                p["native_text"] = p.get("native_text") or p.get("text")
                p["preferred_source"] = "native"
                p["method"] = p.get("method") or "native"
            else:
                p["visual_verification_status"] = "pending"
                nq = assess_native_text_quality(p.get("text") or "")
                p["text_quality_status"] = nq.get("text_quality_status")
                p["quality_warnings"] = nq.get("quality_warnings") or []
                p["native_text"] = p.get("native_text") or p.get("text")
                reasons = ["visual_verification_pending"]
                if nq.get("quality_warnings"):
                    reasons.extend(nq["quality_warnings"])
                p["review_reasons"] = reasons
                if nq.get("text_quality_status") != "pass":
                    p["method"] = (
                        "native_with_warnings"
                        if (p.get("method") or "native") == "native"
                        else p.get("method")
                    )


def _rebuild_full_text(summary: dict, sample_dir: Path) -> None:
    parts = []
    for p in summary["pages"]:
        parts.append(
            f"===== PDF PAGE {p['page_number']} / {summary['page_count']} "
            f"(PDF page index, not printed folio) "
            f"({p.get('char_count', 0)} chars, {p.get('method')}) =====\n"
            f"{(p.get('text') or '').rstrip()}\n"
        )
    full_name = summary["outputs"]["full_text"]
    (sample_dir / full_name).write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Remediate two-sample extraction quality.")
    parser.add_argument(
        "--prior-run-dir",
        type=Path,
        required=True,
        help="Existing two_sample_* diagnostics folder (left unchanged)",
    )
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args(argv)

    prior = args.prior_run_dir.expanduser().resolve()
    if not prior.is_dir():
        print(f"ERROR: prior run not found: {prior}", file=sys.stderr)
        return 1

    settings = load_settings()
    if settings.pdf_source_dir is None or settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR / KNOWLEDGE_VECTOR_DB_PATH required", file=sys.stderr)
        return 1

    tess = _prefer_project_tesseract()
    langs = list_tesseract_langs(str(tess))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    diag_root = default_diagnostics_dir(settings)
    run_dir = diag_root / f"quality_fix_{stamp}"
    run_dir.mkdir(parents=True, exist_ok=True)

    # Copy sample trees so prior run stays intact.
    for label in ("native_text", "scanned"):
        _copy_sample_tree(prior / label, run_dir / label)

    report: dict = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "prior_run_dir": str(prior),
        "run_dir": str(run_dir),
        "tesseract": str(tess),
        "tesseract_langs_count": len(langs),
        "hin_available": "hin" in langs,
        "pages_ocr_ran": [],
        "samples": {},
    }

    # --- IS 9666 ---
    n_dir = run_dir / "native_text"
    n_sum_path, n_sum = _load_summary(n_dir)
    pdf_9666 = (settings.pdf_source_dir / IS_9666).resolve()
    cover = remediate_9666_cover(
        pdf_path=pdf_9666,
        sample_dir=n_dir,
        summary=n_sum,
        out_renders=n_dir / "quality_renders",
        langs=langs,
        dpi=args.dpi,
    )
    layout = remediate_9666_layout(
        pdf_path=pdf_9666,
        sample_dir=n_dir,
        summary=n_sum,
        crop_dir=n_dir / "layout_crops",
    )
    _mark_unaffected_visual_pending(
        n_sum, {AFFECTED_9666_COVER, AFFECTED_9666_TABLE, AFFECTED_9666_FORMULA}, label="native_text"
    )
    if cover.get("ocr_ran"):
        report["pages_ocr_ran"].append({"sample": "native_text", "page": 1, "lang": "hin+eng"})
    _rebuild_full_text(n_sum, n_dir)
    n_sum["remediation"] = {"cover": cover, "layout": {
        "table_status": layout["table_status"],
        "formula_status": layout["formula_status"],
        "table_reasons": layout["table"]["review_reasons"],
        "formula_reasons": layout["formula"]["review_reasons"],
        "table_crop": layout["table"].get("crop_path"),
        "formula_crop": layout["formula"].get("crop_path"),
    }}
    _save_summary(n_sum_path, n_sum)

    # --- IS 2676 ---
    s_dir = run_dir / "scanned"
    s_sum_path, s_sum = _load_summary(s_dir)
    pdf_2676 = (settings.pdf_source_dir / IS_2676).resolve()
    ocr_2676 = remediate_2676(
        pdf_path=pdf_2676,
        sample_dir=s_dir,
        summary=s_sum,
        out_renders=s_dir / "quality_renders",
        dpi=args.dpi,
    )
    for pn in AFFECTED_2676_PAGES:
        report["pages_ocr_ran"].append({"sample": "scanned", "page": pn, "lang": "eng"})
    _mark_unaffected_visual_pending(s_sum, set(AFFECTED_2676_PAGES), label="scanned")
    _rebuild_full_text(s_sum, s_dir)
    s_sum["remediation"] = {"forced_ocr": ocr_2676}
    _save_summary(s_sum_path, s_sum)

    # --- Inspect renders we can (cover + 2676 pages) for visual notes ---
    # Agent/runtime may inspect images; record paths always.
    report["render_paths_for_inspection"] = {
        "is_9666_cover": cover.get("render_path"),
        "is_9666_table_crop": layout["table"].get("crop_path"),
        "is_9666_formula_crop": layout["formula"].get("crop_path"),
        "is_2676_pages": ocr_2676["renders"],
    }

    # --- Chunks: load prior for stable IDs / versions ---
    prior_chunks_dir = prior / "chunks"
    chunks_out = run_dir / "chunks"
    chunks_out.mkdir(parents=True, exist_ok=True)
    overview = []

    for label, summary, rel in (
        ("native_text", n_sum, IS_9666),
        ("scanned", s_sum, IS_2676),
    ):
        prior_path = prior_chunks_dir / f"{label}__chunks.json"
        prior_chunks = []
        if prior_path.is_file():
            prior_chunks = json.loads(prior_path.read_text(encoding="utf-8")).get("chunks") or []
        file_hash = sha256_file((settings.pdf_source_dir / rel).resolve())
        chunks = build_chunks_from_summary(
            summary,
            source_file_hash=file_hash,
            sample_label=label,
            prior_chunks=prior_chunks,
        )
        # Patch layout crop onto affected page chunks
        for c in chunks:
            pn = c.pdf_pages[0]
            page = _page_by_number(summary, pn)
            if page.get("layout_crop_path"):
                c.layout_crop_path = page["layout_crop_path"]
            if page.get("native_text") is not None:
                c.native_text = page.get("native_text")
            if page.get("ocr_text") is not None:
                c.ocr_text = page.get("ocr_text")
            if page.get("preferred_source"):
                c.preferred_source = page.get("preferred_source")

        usable = sum(1 for c in chunks if c.review_status == "usable")
        needs = sum(1 for c in chunks if c.review_status == "needs_review")
        # backward-compatible alias
        stats = {
            "page_count": summary["page_count"],
            "chunks_usable": usable,
            "chunks_needs_review": needs,
            "chunks_ok_legacy_alias": usable,
            "chunks_with_clause": sum(1 for c in chunks if c.clause_number),
            "pages_with_ocr_trial": sum(
                1
                for p in summary["pages"]
                if p.get("ocr_text")
            ),
        }
        out = write_chunks_bundle(
            out_dir=chunks_out,
            sample_label=label,
            relative_path=rel,
            source_file_hash=file_hash,
            chunks=chunks,
            summary_stats=stats,
        )
        overview.append({"label": label, "relative_path": rel, "chunk_count": len(chunks), "output": str(out), **stats})
        report["samples"][label] = {
            "summary_json": str(
                (run_dir / label / summary["outputs"]["summary_json"]).resolve()
            ),
            "chunk_output": str(out),
            **stats,
        }

    (chunks_out / "chunks_overview.json").write_text(
        json.dumps({"run_dir": str(run_dir), "samples": overview}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )

    report["cover_trial"] = cover
    report["layout_verification"] = {
        "table_status": layout["table_status"],
        "formula_status": layout["formula_status"],
        "table_reasons": layout["table"]["review_reasons"],
        "formula_reasons": layout["formula"]["review_reasons"],
    }
    report["is_2676_ocr_trials"] = ocr_2676["trials"]
    report["command"] = (
        f'{_REPO_ROOT / "knowledge_engine" / ".conda" / "bin" / "python"} '
        f"-m knowledge_engine.scripts.remediate_extraction_quality "
        f'--prior-run-dir "{prior}"'
    )

    report_path = run_dir / "quality_fix_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"run_dir": str(run_dir), "report": str(report_path), "pages_ocr_ran": report["pages_ocr_ran"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
