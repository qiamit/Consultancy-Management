#!/usr/bin/env python3
"""
Scan KNOWLEDGE_PDF_SOURCE_DIR and build a deterministic representative pilot selection.

- Does NOT modify / move / copy source PDFs
- Does NOT create/overwrite Chroma collections
- Does NOT start indexing

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.select_pilot_sources
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.select_pilot_sources --target 40
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.pilot.constants import (
    BASELINE_MUST_INCLUDE,
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_MODEL,
    PILOT_SELECTION_ID,
    PILOT_SELECTION_SEED,
    PROTECTED_COLLECTIONS,
    TARGET_PILOT_DEFAULT,
    TARGET_PILOT_MAX,
    TARGET_PILOT_MIN,
)

YEAR_RE = re.compile(r"\b(19\d{2}|20[0-2]\d)\b")
IS_RE = re.compile(r"\bIS\s*(\d+)", re.I)
AMD_RE = re.compile(r"(?:AMD|AMEND|AMENDMENT|_Amd)\s*\d*", re.I)
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


def _stable_key(rel: str) -> str:
    return hashlib.sha256(f"{PILOT_SELECTION_SEED}|{rel}".encode("utf-8")).hexdigest()


def _folder_context(rel: str) -> str:
    parts = Path(rel).parts
    low = [p.lower() for p in parts]
    if any(p == "test method" or p == "test methods" for p in low):
        return "test_method"
    if any("master document" in p for p in low):
        return "master_documents"
    if any("amend" in p for p in low):
        return "amendment_folder"
    return "standard_root"


def _filename_flags(name: str) -> dict[str, Any]:
    years = [int(y) for y in YEAR_RE.findall(name)]
    year = max(years) if years else None
    is_m = IS_RE.search(name)
    return {
        "year_from_name": year,
        "is_number_from_name": f"IS {is_m.group(1)}" if is_m else None,
        "amendment_from_name": bool(AMD_RE.search(name)),
        "modern_from_name": bool(year and year >= 2015),
        "old_from_name": bool(year and year <= 1995),
    }


def _cheap_pdf_probe(path: Path) -> dict[str, Any]:
    """Cheap open: page count + text-layer sample. No OCR, no writes."""
    import pymupdf as fitz

    out: dict[str, Any] = {
        "page_count": None,
        "sample_native_chars": 0,
        "has_devanagari": False,
        "has_table_token": False,
        "has_formula_token": False,
        "classification": "suspect",
        "probe_error": None,
    }
    try:
        doc = fitz.open(path)
    except Exception as exc:  # noqa: BLE001
        out["probe_error"] = str(exc)[:200]
        return out

    try:
        n = doc.page_count
        out["page_count"] = n
        sample_pages = min(3, n)
        texts: list[str] = []
        for i in range(sample_pages):
            try:
                texts.append(doc.load_page(i).get_text("text") or "")
            except Exception:  # noqa: BLE001
                continue
        blob = "\n".join(texts)
        alnum = sum(1 for ch in blob if ch.isalnum())
        out["sample_native_chars"] = alnum
        out["has_devanagari"] = bool(DEVANAGARI_RE.search(blob))
        low = blob.lower()
        out["has_table_token"] = bool(re.search(r"\btable\b|तालिका", low))
        out["has_formula_token"] = bool(
            re.search(r"formula|calculation|×|percent by mass|equation|सूत्र", low, re.I)
        )
        # Classification heuristic (not final quality gate).
        # Many legacy scans have an OCR text layer — still flag low density / thin text.
        chars_per_page = alnum / max(sample_pages, 1)
        out["chars_per_sample_page"] = round(chars_per_page, 1)
        if alnum < 80 or chars_per_page < 40:
            out["classification"] = "scanned_or_image"
        elif alnum < 250 or chars_per_page < 120:
            out["classification"] = "suspect"
        else:
            out["classification"] = "native_text"
    finally:
        doc.close()
    return out


def _inventory_all(src: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in sorted(src.rglob("*.pdf")):
        try:
            rel = str(p.relative_to(src)).replace("\\", "/")
        except ValueError:
            continue
        try:
            size = p.stat().st_size
        except OSError:
            size = -1
        flags = _filename_flags(p.name)
        rows.append(
            {
                "relative_path": rel,
                "file_name": p.name,
                "size_bytes": size,
                "folder_context": _folder_context(rel),
                "std_folder": Path(rel).parts[0] if Path(rel).parts else "",
                **flags,
                "stable_key": _stable_key(rel),
            }
        )
    return rows


def _pick_bucket(
    pool: list[dict[str, Any]],
    *,
    n: int,
    selected: set[str],
    predicate,
) -> list[dict[str, Any]]:
    cands = [
        r
        for r in pool
        if r["relative_path"] not in selected and predicate(r)
    ]
    cands.sort(key=lambda r: r["stable_key"])
    out = cands[:n]
    for r in out:
        selected.add(r["relative_path"])
    return out


def _select(
    inventory: list[dict[str, Any]],
    *,
    target: int,
    src: Path,
) -> list[dict[str, Any]]:
    selected: set[str] = set()
    chosen: list[dict[str, Any]] = []

    by_rel = {r["relative_path"]: r for r in inventory}

    # 1) Must-include baseline (regression continuity)
    for rel in BASELINE_MUST_INCLUDE:
        if rel in by_rel and rel not in selected:
            row = dict(by_rel[rel])
            row["selection_reason"] = "validated_baseline_must_include"
            row["selection_bucket"] = "baseline"
            chosen.append(row)
            selected.add(rel)

    # Probe a stratified candidate pool first (cheaper than probing all 10k).
    # Oversample legacy / amendment / master / root so scanned PDFs are not missed.
    probe_pool: list[dict[str, Any]] = []
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in inventory:
        if r["relative_path"] in selected:
            continue
        g = r["folder_context"]
        if r.get("amendment_from_name"):
            g = "amendment_name"
        elif r.get("old_from_name"):
            g = "old_name"
        elif r.get("modern_from_name"):
            g = "modern_name"
        groups[g].append(r)
    per_group = {
        "old_name": 120,
        "amendment_name": 80,
        "master_documents": 60,
        "standard_root": 80,
        "test_method": 60,
        "modern_name": 60,
        "amendment_folder": 40,
    }
    for g, rows in groups.items():
        rows.sort(key=lambda x: x["stable_key"])
        probe_pool.extend(rows[: per_group.get(g, 50)])

    # Always probe must-include + probe pool
    to_probe = list(chosen) + probe_pool
    seen_probe: set[str] = set()
    probed: list[dict[str, Any]] = []
    for r in to_probe:
        rel = r["relative_path"]
        if rel in seen_probe:
            continue
        seen_probe.add(rel)
        path = src / rel
        probe = _cheap_pdf_probe(path) if path.is_file() else {"probe_error": "missing", "classification": "suspect"}
        merged = {**r, **probe}
        # Legacy-year hint even when OCR text layer exists
        if merged.get("old_from_name") and merged.get("classification") == "native_text":
            merged["legacy_year_flag"] = True
        probed.append(merged)
        # update chosen baseline rows with probe
        if rel in selected:
            for i, c in enumerate(chosen):
                if c["relative_path"] == rel:
                    chosen[i] = {
                        **c,
                        **probe,
                        "selection_reason": c.get("selection_reason"),
                        "selection_bucket": c.get("selection_bucket"),
                    }

    probed_by = {r["relative_path"]: r for r in probed}
    pool = list(probed)

    def add(bucket: str, reason: str, n: int, pred) -> None:
        nonlocal chosen
        picks = _pick_bucket(pool, n=n, selected=selected, predicate=pred)
        for p in picks:
            row = dict(probed_by.get(p["relative_path"], p))
            row["selection_bucket"] = bucket
            row["selection_reason"] = reason
            chosen.append(row)

    add(
        "modern_native",
        "modern year in name + native-text sample",
        7,
        lambda r: r.get("modern_from_name")
        and r.get("classification") == "native_text"
        and r.get("folder_context") == "standard_root",
    )
    add(
        "scanned_or_image",
        "low text-layer density (likely scan/image)",
        8,
        lambda r: r.get("classification") == "scanned_or_image",
    )
    add(
        "suspect_quality",
        "borderline / suspect text-layer sample",
        4,
        lambda r: r.get("classification") == "suspect",
    )
    add(
        "legacy_year",
        "pre-1996 filename year (legacy corpus)",
        5,
        lambda r: bool(r.get("old_from_name")),
    )
    add(
        "test_method",
        "Test Method folder (capped for balance)",
        5,
        lambda r: r.get("folder_context") == "test_method",
    )
    add(
        "master_documents",
        "Master Documents folder",
        4,
        lambda r: r.get("folder_context") == "master_documents",
    )
    add(
        "amendment",
        "amendment/revision in filename",
        4,
        lambda r: bool(r.get("amendment_from_name")),
    )
    add(
        "hindi_devanagari",
        "Devanagari text detected in sample pages",
        3,
        lambda r: bool(r.get("has_devanagari")),
    )
    add(
        "multi_page",
        "multi-page standard (>= 40 pages)",
        3,
        lambda r: (r.get("page_count") or 0) >= 40,
    )
    add(
        "tables_or_formulas",
        "table/formula tokens in sample text",
        3,
        lambda r: bool(r.get("has_table_token") or r.get("has_formula_token")),
    )

    # Fill remaining with diverse STD folders
    remaining = target - len(chosen)
    if remaining > 0:
        used_stds = {c.get("std_folder") for c in chosen}
        diversify = [
            r
            for r in sorted(pool, key=lambda x: x["stable_key"])
            if r["relative_path"] not in selected and r.get("std_folder") not in used_stds
        ]
        # Prefer one per std folder
        for r in diversify:
            if len(chosen) >= target:
                break
            row = dict(r)
            row["selection_bucket"] = "std_diversity"
            row["selection_reason"] = "spread across different STD folders"
            chosen.append(row)
            selected.add(row["relative_path"])
            used_stds.add(row.get("std_folder"))

        # If still short, take next stable keys
        if len(chosen) < target:
            for r in sorted(pool, key=lambda x: x["stable_key"]):
                if len(chosen) >= target:
                    break
                if r["relative_path"] in selected:
                    continue
                row = dict(r)
                row["selection_bucket"] = "fill"
                row["selection_reason"] = "stable_key fill to target size"
                chosen.append(row)
                selected.add(row["relative_path"])

    # Cap at target (keep baseline first)
    if len(chosen) > target:
        baseline = [c for c in chosen if c.get("selection_bucket") == "baseline"]
        rest = [c for c in chosen if c.get("selection_bucket") != "baseline"]
        rest.sort(key=lambda x: (x.get("selection_bucket") or "", x["stable_key"]))
        chosen = baseline + rest[: max(0, target - len(baseline))]

    # Ensure probes on all chosen (in case fill from unprobed — shouldn't happen)
    for i, c in enumerate(chosen):
        if c.get("page_count") is None and not c.get("probe_error"):
            path = src / c["relative_path"]
            probe = _cheap_pdf_probe(path) if path.is_file() else {"probe_error": "missing"}
            chosen[i] = {**c, **probe}

    chosen.sort(key=lambda x: (0 if x.get("selection_bucket") == "baseline" else 1, x["relative_path"]))
    return chosen


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Select representative BIS pilot PDFs (no indexing)")
    parser.add_argument("--target", type=int, default=TARGET_PILOT_DEFAULT)
    parser.add_argument("--skip-probe", action="store_true", help="Filename/folder only (faster, weaker)")
    args = parser.parse_args(argv)

    target = max(TARGET_PILOT_MIN, min(TARGET_PILOT_MAX, int(args.target)))
    settings = load_settings()
    if settings.pdf_source_dir is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR unset", file=sys.stderr)
        return 2
    src = settings.pdf_source_dir
    if not src.is_dir():
        print(f"ERROR: source dir missing: {src}", file=sys.stderr)
        return 2

    t0 = time.perf_counter()
    print(f"Scanning PDFs under {src} …", flush=True)
    inventory = _inventory_all(src)
    scan_s = time.perf_counter() - t0
    print(f"Found {len(inventory)} PDFs in {scan_s:.1f}s", flush=True)

    t1 = time.perf_counter()
    if args.skip_probe:
        # Minimal selection without pymupdf
        selected = []
        sel_set: set[str] = set()
        by_rel = {r["relative_path"]: r for r in inventory}
        for rel in BASELINE_MUST_INCLUDE:
            if rel in by_rel:
                row = dict(by_rel[rel])
                row["selection_bucket"] = "baseline"
                row["selection_reason"] = "validated_baseline_must_include"
                selected.append(row)
                sel_set.add(rel)
        for r in sorted(inventory, key=lambda x: x["stable_key"]):
            if len(selected) >= target:
                break
            if r["relative_path"] in sel_set:
                continue
            row = dict(r)
            row["selection_bucket"] = "stable_key"
            row["selection_reason"] = "skip-probe mode"
            selected.append(row)
            sel_set.add(row["relative_path"])
    else:
        selected = _select(inventory, target=target, src=src)
    probe_s = time.perf_counter() - t1

    class_dist = Counter(s.get("classification") or "unknown" for s in selected)
    folder_dist = Counter(s.get("folder_context") or "unknown" for s in selected)
    bucket_dist = Counter(s.get("selection_bucket") or "unknown" for s in selected)

    out_dir = default_diagnostics_dir(settings) / "pilot"
    out_dir.mkdir(parents=True, exist_ok=True)
    inv_path = out_dir / f"{PILOT_SELECTION_ID}_inventory_summary.json"
    sel_path = out_dir / f"{PILOT_SELECTION_ID}_selected.json"
    md_path = out_dir / f"{PILOT_SELECTION_ID}_report.md"

    inventory_summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection_id": PILOT_SELECTION_ID,
        "selection_seed": PILOT_SELECTION_SEED,
        "source_dir": str(src),
        "total_pdfs": len(inventory),
        "scan_seconds": round(scan_s, 2),
        "probe_seconds": round(probe_s, 2),
        "folder_context_counts": dict(Counter(r["folder_context"] for r in inventory)),
        "std_folder_count": len({r["std_folder"] for r in inventory}),
        "amendment_name_count": sum(1 for r in inventory if r.get("amendment_from_name")),
        "modern_name_count": sum(1 for r in inventory if r.get("modern_from_name")),
        "old_name_count": sum(1 for r in inventory if r.get("old_from_name")),
        "note": "Full per-file inventory kept lightweight (path/size/name flags). Deep probe only on selection candidates.",
    }
    inv_path.write_text(json.dumps(inventory_summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    selection_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection_id": PILOT_SELECTION_ID,
        "selection_seed": PILOT_SELECTION_SEED,
        "proposed_collection": PILOT_COLLECTION_NAME,
        "protected_collections_untouched": sorted(PROTECTED_COLLECTIONS),
        "embedding_model": PILOT_EMBEDDING_MODEL,
        "target": target,
        "selected_count": len(selected),
        "classification_distribution": dict(class_dist),
        "folder_context_distribution": dict(folder_dist),
        "bucket_distribution": dict(bucket_dist),
        "indexing_not_started": True,
        "index_command_when_ready": (
            "knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_index "
            f"--selection {sel_path}"
        ),
        "selected": [
            {
                "relative_path": s["relative_path"],
                "size_bytes": s.get("size_bytes"),
                "page_count": s.get("page_count"),
                "classification": s.get("classification"),
                "folder_context": s.get("folder_context"),
                "year_from_name": s.get("year_from_name"),
                "is_number_from_name": s.get("is_number_from_name"),
                "has_devanagari": s.get("has_devanagari"),
                "has_table_token": s.get("has_table_token"),
                "has_formula_token": s.get("has_formula_token"),
                "selection_bucket": s.get("selection_bucket"),
                "selection_reason": s.get("selection_reason"),
                "probe_error": s.get("probe_error"),
            }
            for s in selected
        ],
    }
    sel_path.write_text(json.dumps(selection_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        f"# Pilot selection `{PILOT_SELECTION_ID}`",
        "",
        f"- Total source PDFs: **{len(inventory)}**",
        f"- Selected: **{len(selected)}** (target {target})",
        f"- Proposed collection: `{PILOT_COLLECTION_NAME}`",
        f"- Protected (untouched): {', '.join(sorted(PROTECTED_COLLECTIONS))}",
        f"- Embedding (when indexing): `{PILOT_EMBEDDING_MODEL}`",
        f"- Indexing started: **no**",
        "",
        "## Classification (selected)",
        "",
    ]
    for k, v in sorted(class_dist.items()):
        lines.append(f"- {k}: {v}")
    lines += ["", "## Selected files", ""]
    for i, s in enumerate(selected, 1):
        lines.append(
            f"{i}. `{s['relative_path']}` — "
            f"pages={s.get('page_count')}, class={s.get('classification')}, "
            f"bucket={s.get('selection_bucket')}, reason={s.get('selection_reason')}"
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Selected {len(selected)} / target {target}")
    print(f"classification: {dict(class_dist)}")
    print(f"Wrote {sel_path}")
    print(f"Wrote {md_path}")
    print("Indexing NOT started.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
