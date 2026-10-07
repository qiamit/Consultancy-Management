#!/usr/bin/env python3
"""
Build second-pilot selection: keep existing 40 + ~110 stratified additions.

- Does NOT modify / move / copy source PDFs
- Does NOT create/overwrite Chroma collections
- Does NOT start indexing / OCR / embedding

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.select_second_pilot_sources
"""

from __future__ import annotations

import argparse
import hashlib
import json
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
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_MODEL,
    PILOT_SELECTION_ID,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_ADDITIONS_TARGET,
    SECOND_PILOT_COLLECTION_NAME,
    SECOND_PILOT_EXISTING_KEEP,
    SECOND_PILOT_SELECTION_ID,
    SECOND_PILOT_SELECTION_SEED,
    SECOND_PILOT_TARGET_TOTAL,
)
from knowledge_engine.scripts.select_pilot_sources import (
    _cheap_pdf_probe,
    _filename_flags,
    _folder_context,
    _inventory_all,
)


def _stable_key(rel: str) -> str:
    return hashlib.sha256(f"{SECOND_PILOT_SELECTION_SEED}|{rel}".encode("utf-8")).hexdigest()


def _load_existing_pilot(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    selected = list(data.get("selected") or [])
    if len(selected) != SECOND_PILOT_EXISTING_KEEP:
        print(
            f"WARNING: expected {SECOND_PILOT_EXISTING_KEEP} existing pilot files, found {len(selected)}",
            file=sys.stderr,
        )
    return selected


def _pick_bucket(
    pool: list[dict[str, Any]],
    *,
    n: int,
    selected: set[str],
    predicate,
) -> list[dict[str, Any]]:
    cands = [r for r in pool if r["relative_path"] not in selected and predicate(r)]
    cands.sort(key=lambda r: r["stable_key"])
    out = cands[:n]
    for r in out:
        selected.add(r["relative_path"])
    return out


def _build_probe_pool(inventory: list[dict[str, Any]], exclude: set[str]) -> list[dict[str, Any]]:
    """Stratified oversample for difficult categories (deterministic)."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in inventory:
        if r["relative_path"] in exclude:
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
        "old_name": 220,
        "amendment_name": 140,
        "master_documents": 100,
        "standard_root": 160,
        "test_method": 120,
        "modern_name": 100,
        "amendment_folder": 80,
    }
    pool: list[dict[str, Any]] = []
    for g, rows in groups.items():
        rows = [{**r, "stable_key": _stable_key(r["relative_path"])} for r in rows]
        rows.sort(key=lambda x: x["stable_key"])
        pool.extend(rows[: per_group.get(g, 80)])
    return pool


def _select_additions(
    *,
    inventory: list[dict[str, Any]],
    exclude: set[str],
    src: Path,
    target_additions: int,
) -> list[dict[str, Any]]:
    selected: set[str] = set(exclude)
    chosen: list[dict[str, Any]] = []
    probe_pool = _build_probe_pool(inventory, exclude)

    probed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in probe_pool:
        rel = r["relative_path"]
        if rel in seen:
            continue
        seen.add(rel)
        path = src / rel
        probe = _cheap_pdf_probe(path) if path.is_file() else {"probe_error": "missing", "classification": "suspect"}
        row = {**r, **probe, "stable_key": _stable_key(rel)}
        if row.get("old_from_name") and row.get("classification") == "native_text":
            row["legacy_year_flag"] = True
        probed.append(row)

    probed_by = {r["relative_path"]: r for r in probed}
    pool = list(probed)

    def add(bucket: str, reason: str, n: int, pred) -> None:
        nonlocal chosen
        picks = _pick_bucket(pool, n=n, selected=selected, predicate=pred)
        for p in picks:
            row = dict(probed_by.get(p["relative_path"], p))
            row["selection_bucket"] = bucket
            row["selection_reason"] = reason
            row["pilot_wave"] = "second_pilot_addition"
            chosen.append(row)

    # Intentionally heavy on difficult / risk categories (not easy-native dominated).
    add(
        "scanned_or_image",
        "low text-layer density (likely scan/image) — OCR / needs_review risk",
        28,
        lambda r: r.get("classification") == "scanned_or_image",
    )
    add(
        "suspect_quality",
        "borderline / suspect text-layer — quality-gate stress",
        16,
        lambda r: r.get("classification") == "suspect",
    )
    add(
        "legacy_year",
        "pre-1996 filename year (legacy / old standards)",
        12,
        lambda r: bool(r.get("old_from_name") or r.get("legacy_year_flag")),
    )
    add(
        "hindi_devanagari",
        "Devanagari text detected in sample pages",
        10,
        lambda r: bool(r.get("has_devanagari")),
    )
    add(
        "test_method",
        "Test Method folder document",
        10,
        lambda r: r.get("folder_context") == "test_method",
    )
    add(
        "master_documents",
        "Master Documents folder",
        8,
        lambda r: r.get("folder_context") == "master_documents",
    )
    add(
        "amendment",
        "amendment/revision in filename or folder",
        8,
        lambda r: bool(r.get("amendment_from_name")) or r.get("folder_context") == "amendment_folder",
    )
    add(
        "tables_or_formulas",
        "table/formula tokens in sample text",
        8,
        lambda r: bool(r.get("has_table_token") or r.get("has_formula_token")),
    )
    add(
        "multi_page",
        "long / multi-page standard (>= 40 pages)",
        6,
        lambda r: (r.get("page_count") or 0) >= 40,
    )
    add(
        "modern_native",
        "modern year + native-text (balance; capped so natives do not dominate)",
        8,
        lambda r: r.get("modern_from_name")
        and r.get("classification") == "native_text"
        and r.get("folder_context") == "standard_root",
    )

    # Diversify across STD folders not yet represented in additions
    used_stds = {c.get("std_folder") for c in chosen}
    remaining = target_additions - len(chosen)
    if remaining > 0:
        diversify = [
            r
            for r in sorted(pool, key=lambda x: x["stable_key"])
            if r["relative_path"] not in selected and r.get("std_folder") not in used_stds
        ]
        for r in diversify:
            if len(chosen) >= target_additions:
                break
            row = dict(r)
            row["selection_bucket"] = "std_diversity"
            row["selection_reason"] = "spread across different STD folders"
            row["pilot_wave"] = "second_pilot_addition"
            chosen.append(row)
            selected.add(row["relative_path"])
            used_stds.add(row.get("std_folder"))

    if len(chosen) < target_additions:
        for r in sorted(pool, key=lambda x: x["stable_key"]):
            if len(chosen) >= target_additions:
                break
            if r["relative_path"] in selected:
                continue
            # Prefer non-native when filling to avoid native dominance
            if r.get("classification") == "native_text" and sum(
                1 for c in chosen if c.get("classification") == "native_text"
            ) > target_additions * 0.55:
                continue
            row = dict(r)
            row["selection_bucket"] = "fill"
            row["selection_reason"] = "stable_key fill to addition target"
            row["pilot_wave"] = "second_pilot_addition"
            chosen.append(row)
            selected.add(row["relative_path"])

    # Cap
    if len(chosen) > target_additions:
        chosen.sort(key=lambda x: (x.get("selection_bucket") or "", x["stable_key"]))
        # Prefer keeping difficult classes when trimming
        priority = {
            "scanned_or_image": 0,
            "suspect_quality": 1,
            "legacy_year": 2,
            "hindi_devanagari": 3,
            "tables_or_formulas": 4,
            "amendment": 5,
            "test_method": 6,
            "master_documents": 7,
            "multi_page": 8,
            "std_diversity": 9,
            "modern_native": 10,
            "fill": 11,
        }
        chosen.sort(key=lambda x: (priority.get(x.get("selection_bucket") or "", 99), x["stable_key"]))
        dropped = chosen[target_additions:]
        chosen = chosen[:target_additions]
        for d in dropped:
            selected.discard(d["relative_path"])

    for i, c in enumerate(chosen):
        if c.get("page_count") is None and not c.get("probe_error"):
            path = src / c["relative_path"]
            probe = _cheap_pdf_probe(path) if path.is_file() else {"probe_error": "missing"}
            chosen[i] = {**c, **probe}

    chosen.sort(key=lambda x: x["relative_path"])
    return chosen


def _serialize_file(s: dict[str, Any], *, wave: str) -> dict[str, Any]:
    return {
        "relative_path": s["relative_path"],
        "size_bytes": s.get("size_bytes"),
        "page_count": s.get("page_count"),
        "classification": s.get("classification"),
        "folder_context": s.get("folder_context"),
        "std_folder": s.get("std_folder") or (Path(s["relative_path"]).parts[0] if s.get("relative_path") else ""),
        "year_from_name": s.get("year_from_name"),
        "is_number_from_name": s.get("is_number_from_name"),
        "has_devanagari": s.get("has_devanagari"),
        "has_table_token": s.get("has_table_token"),
        "has_formula_token": s.get("has_formula_token"),
        "selection_bucket": s.get("selection_bucket"),
        "selection_reason": s.get("selection_reason"),
        "pilot_wave": wave,
        "probe_error": s.get("probe_error"),
        "chars_per_sample_page": s.get("chars_per_sample_page"),
        "quality_risk_estimate": _quality_risk(s),
    }


def _quality_risk(s: dict[str, Any]) -> str:
    cls = s.get("classification")
    if cls == "scanned_or_image":
        return "high"
    if cls == "suspect":
        return "high"
    if s.get("has_table_token") or s.get("has_formula_token"):
        return "medium"
    if s.get("old_from_name") or s.get("legacy_year_flag"):
        return "medium"
    return "low"


def _evaluation_plan() -> dict[str, Any]:
    return {
        "authoritative_suite_rerun_after_index": {
            "answerable_pass_at_1_baseline": "34/35",
            "pass_at_3": "35/35",
            "pass_at_5": "35/35",
            "not_found": "16/16",
            "r5_principle_rank": 1,
            "hindi_lhc_rank": 1,
            "hindi_extraneous_rank": 1,
            "known_acceptable_miss": "a10_en_annex_title Rank 2 (not a regression)",
            "do_not_arbitrarily_retune_thresholds": True,
        },
        "split_retrieval_metrics": {
            "A_standard_filtered": [
                "Pass@1",
                "Pass@3",
                "Pass@5",
                "NOT_FOUND rejection",
                "false_positives",
                "false_negatives",
                "standard_leaks",
            ],
            "B_all_standards": [
                "correct_standard_rank",
                "correct_clause_rank",
                "Pass@1",
                "Pass@3",
                "Pass@5",
                "irrelevant_standard_intrusion_in_top5",
            ],
            "note": "Do not arbitrary-tune retrieval just because All-mode Top-5 has noise; measure explicitly.",
        },
        "proposed_second_pilot_gold": {
            "english_queries": 20,
            "hindi_queries": 15,
            "mixed_language_queries": 8,
            "formula_queries": 6,
            "table_value_queries": 6,
            "test_method_queries": 8,
            "amendment_version_sensitive_queries": 5,
            "not_found_queries": 12,
            "total_proposed_min": 80,
            "rule": "Gold answers must be fixed before evaluation runs.",
        },
        "needs_review_quality_goal": (
            "Confirm bad OCR / uncertain tables / broken formulas / garbled extraction "
            "do not silently enter trusted usable retrieval."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Select second-pilot PDFs (no indexing)")
    parser.add_argument("--additions", type=int, default=SECOND_PILOT_ADDITIONS_TARGET)
    parser.add_argument(
        "--existing-selection",
        type=str,
        default="",
        help="Path to pilot_selection_v1_selected.json (default: diagnostics/pilot/…)",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.pdf_source_dir is None:
        print("ERROR: KNOWLEDGE_PDF_SOURCE_DIR unset", file=sys.stderr)
        return 2
    src = settings.pdf_source_dir
    if not src.is_dir():
        print(f"ERROR: source dir missing: {src}", file=sys.stderr)
        return 2

    out_dir = default_diagnostics_dir(settings) / "pilot"
    out_dir.mkdir(parents=True, exist_ok=True)

    existing_path = (
        Path(args.existing_selection)
        if args.existing_selection
        else out_dir / f"{PILOT_SELECTION_ID}_selected.json"
    )
    if not existing_path.is_file():
        print(f"ERROR: existing pilot selection not found: {existing_path}", file=sys.stderr)
        return 2

    existing_raw = _load_existing_pilot(existing_path)
    existing_rels = {e["relative_path"] for e in existing_raw}

    t0 = time.perf_counter()
    print(f"Scanning PDFs under {src} …", flush=True)
    inventory = _inventory_all(src)
    # Attach stable keys for second pilot seed
    for r in inventory:
        r["stable_key"] = _stable_key(r["relative_path"])
        r["folder_context"] = r.get("folder_context") or _folder_context(r["relative_path"])
        flags = _filename_flags(Path(r["relative_path"]).name)
        for k, v in flags.items():
            r.setdefault(k, v)
    scan_s = time.perf_counter() - t0
    print(f"Found {len(inventory)} PDFs in {scan_s:.1f}s", flush=True)

    t1 = time.perf_counter()
    additions = _select_additions(
        inventory=inventory,
        exclude=existing_rels,
        src=src,
        target_additions=int(args.additions),
    )
    probe_s = time.perf_counter() - t1

    existing_out = []
    for e in existing_raw:
        row = dict(e)
        row["pilot_wave"] = "existing_pilot"
        row["std_folder"] = row.get("std_folder") or (
            Path(row["relative_path"]).parts[0] if row.get("relative_path") else ""
        )
        row["quality_risk_estimate"] = _quality_risk(row)
        if "selection_reason" not in row:
            row["selection_reason"] = "kept_from_first_pilot"
        existing_out.append(_serialize_file(row, wave="existing_pilot"))

    additions_out = [_serialize_file(a, wave="second_pilot_addition") for a in additions]
    all_selected = existing_out + additions_out

    class_dist = Counter(s.get("classification") or "unknown" for s in all_selected)
    folder_dist = Counter(s.get("folder_context") or "unknown" for s in all_selected)
    wave_dist = Counter(s.get("pilot_wave") or "unknown" for s in all_selected)
    bucket_dist = Counter(s.get("selection_bucket") or "unknown" for s in all_selected)
    risk_dist = Counter(s.get("quality_risk_estimate") or "unknown" for s in all_selected)
    unique_stds = sorted({s.get("std_folder") for s in all_selected if s.get("std_folder")})

    new_pages = sum(int(s.get("page_count") or 0) for s in additions_out)
    ocr_candidates = sum(
        1
        for s in additions_out
        if s.get("classification") in ("scanned_or_image", "suspect")
    )
    ocr_candidate_pages = sum(
        int(s.get("page_count") or 0)
        for s in additions_out
        if s.get("classification") in ("scanned_or_image", "suspect")
    )

    reuse_strategy = {
        "existing_collection": PILOT_COLLECTION_NAME,
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "reuse_by": "content_sha256 / document_id",
        "existing_40": (
            "Copy/reuse extraction + chunk artifacts + embeddings from "
            f"{PILOT_COLLECTION_NAME} where sha256 unchanged; do not re-OCR."
        ),
        "new_additions": "Extract / OCR / chunk / embed only for new content hashes.",
        "move_rename": "Path/filename change with same sha256 → metadata update only.",
        "protected_untouched": sorted(PROTECTED_COLLECTIONS),
    }

    selection_doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection_id": SECOND_PILOT_SELECTION_ID,
        "selection_seed": SECOND_PILOT_SELECTION_SEED,
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "reuse_from_collection": PILOT_COLLECTION_NAME,
        "protected_collections_untouched": sorted(PROTECTED_COLLECTIONS),
        "embedding_model": PILOT_EMBEDDING_MODEL,
        "target_total": SECOND_PILOT_TARGET_TOTAL,
        "existing_kept": len(existing_out),
        "additions_count": len(additions_out),
        "selected_count": len(all_selected),
        "classification_distribution": dict(class_dist),
        "folder_context_distribution": dict(folder_dist),
        "bucket_distribution": dict(bucket_dist),
        "pilot_wave_distribution": dict(wave_dist),
        "quality_risk_distribution": dict(risk_dist),
        "unique_std_folders": len(unique_stds),
        "std_folders": unique_stds,
        "estimated_new_pages": new_pages,
        "estimated_ocr_candidate_files": ocr_candidates,
        "estimated_ocr_candidate_pages": ocr_candidate_pages,
        "scan_seconds": round(scan_s, 2),
        "probe_seconds": round(probe_s, 2),
        "source_total_pdfs": len(inventory),
        "indexing_not_started": True,
        "awaiting_approval": True,
        "reuse_strategy": reuse_strategy,
        "evaluation_plan": _evaluation_plan(),
        "document_identity_strategy": {
            "primary": "document_id = sha256:{content_sha256}",
            "chunk_id_scheme": "doc_{content_sha256[:12]}:pXXXX:cYYY",
            "path_is_mutable_metadata": True,
            "v1_path_dependent_note": (
                "First pilot used path-hash sample_label for non-baseline docs; "
                "v2 uses content-hash. Protected v1 collection will not be rewritten."
            ),
        },
        "index_command_when_approved": (
            "knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_pilot_index "
            f"--selection <{SECOND_PILOT_SELECTION_ID}_selected.json> "
            f"--collection {SECOND_PILOT_COLLECTION_NAME}   # NOT STARTED"
        ),
        "selected": all_selected,
    }

    sel_path = out_dir / f"{SECOND_PILOT_SELECTION_ID}_selected.json"
    inv_path = out_dir / f"{SECOND_PILOT_SELECTION_ID}_inventory_summary.json"
    md_path = out_dir / f"{SECOND_PILOT_SELECTION_ID}_report.md"
    additions_path = out_dir / f"{SECOND_PILOT_SELECTION_ID}_additions_only.json"

    inv_path.write_text(
        json.dumps(
            {
                "generated_at": selection_doc["generated_at"],
                "selection_id": SECOND_PILOT_SELECTION_ID,
                "source_total_pdfs": len(inventory),
                "existing_kept": len(existing_out),
                "additions": len(additions_out),
                "total_selected": len(all_selected),
                "classification_distribution": dict(class_dist),
                "folder_context_distribution": dict(folder_dist),
                "quality_risk_distribution": dict(risk_dist),
                "unique_std_folders": len(unique_stds),
                "estimated_new_pages": new_pages,
                "estimated_ocr_candidate_files": ocr_candidates,
                "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
                "indexing_not_started": True,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    sel_path.write_text(json.dumps(selection_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    additions_path.write_text(
        json.dumps(
            {
                "selection_id": SECOND_PILOT_SELECTION_ID,
                "additions_count": len(additions_out),
                "selected": additions_out,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    lines = [
        f"# Second pilot selection `{SECOND_PILOT_SELECTION_ID}`",
        "",
        f"- Existing pilot kept: **{len(existing_out)}** (`existing_pilot`)",
        f"- New additions: **{len(additions_out)}** (`second_pilot_addition`)",
        f"- Total: **{len(all_selected)}** (target {SECOND_PILOT_TARGET_TOTAL})",
        f"- Proposed collection: `{SECOND_PILOT_COLLECTION_NAME}`",
        f"- Protected (untouched): {', '.join(sorted(PROTECTED_COLLECTIONS))}",
        f"- Indexing started: **no** (awaiting approval)",
        "",
        "## Classification (full second-pilot set)",
        "",
    ]
    for k, v in sorted(class_dist.items()):
        lines.append(f"- {k}: {v}")
    lines += ["", "## Quality risk estimate", ""]
    for k, v in sorted(risk_dist.items()):
        lines.append(f"- {k}: {v}")
    lines += ["", "## Existing pilot (40)", ""]
    for i, s in enumerate(existing_out, 1):
        lines.append(f"{i}. `{s['relative_path']}` — wave=existing_pilot, class={s.get('classification')}")
    lines += ["", "## Second-pilot additions", ""]
    for i, s in enumerate(additions_out, 1):
        lines.append(
            f"{i}. `{s['relative_path']}` — pages={s.get('page_count')}, "
            f"class={s.get('classification')}, IS={s.get('is_number_from_name')}, "
            f"year={s.get('year_from_name')}, folder={s.get('folder_context')}, "
            f"bucket={s.get('selection_bucket')}, risk={s.get('quality_risk_estimate')}, "
            f"reason={s.get('selection_reason')}"
        )
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"Existing kept: {len(existing_out)}")
    print(f"Additions: {len(additions_out)}")
    print(f"Total: {len(all_selected)}")
    print(f"classification: {dict(class_dist)}")
    print(f"quality_risk: {dict(risk_dist)}")
    print(f"unique STD folders: {len(unique_stds)}")
    print(f"estimated NEW pages: {new_pages}")
    print(f"OCR candidate files (new): {ocr_candidates}")
    print(f"Wrote {sel_path}")
    print(f"Wrote {md_path}")
    print("Indexing NOT started. Awaiting approval.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
