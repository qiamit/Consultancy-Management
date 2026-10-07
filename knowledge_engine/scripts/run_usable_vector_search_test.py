#!/usr/bin/env python3
"""
Small local vector search test over usable chunks only.

Does NOT re-run extraction / remediation / bulk indexing.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.run_usable_vector_search_test \\
    --diagnostics-run quality_fix_20261006T144338Z
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.local_vector_test import (
    COLLECTION_NAME,
    assert_no_forbidden_hits,
    build_local_tfidf_index,
    load_usable_chunks,
    query_chromadb,
    try_chromadb_index,
)


# Three small searches: 2× IS 9666 usable, 1× IS 2676 usable (not p8).
SEARCH_CASES = [
    {
        "id": "q1_is9666_extraneous_granules",
        "sample_hint": "IS 9666",
        "query": "blank granules free from extraneous material requirements clause 4.1",
        "expect_notes": "Should hit usable clause 4.1 on PDF page 3",
    },
    {
        "id": "q2_is9666_lhc_formula",
        "sample_hint": "IS 9666",
        "query": "liquid holding capacity calculation formula M M1 percent by mass Annex A",
        "expect_notes": "Should hit usable A-3 / Annex A on PDF page 5",
    },
    {
        "id": "q3_is2676_scope_dimensions",
        "sample_hint": "IS 2676",
        "query": "dimensions and tolerances for wrought aluminium and aluminium alloys sheet and strip",
        "expect_notes": "Should hit usable IS 2676 scope/foreword (page 4 or 7), NOT page 8",
    },
]

# needs_review / known-bad pages must not appear
FORBIDDEN_PAGES = {
    "scanned": {8},  # IS 2676 p8 thickness error
}


def _preview(text: str, n: int = 240) -> str:
    one = " ".join((text or "").split())
    return one[:n] + ("…" if len(one) > n else "")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Usable-chunk local vector search test.")
    parser.add_argument(
        "--diagnostics-run",
        default="quality_fix_20261006T144338Z",
        help="Diagnostics folder name under KNOWLEDGE_VECTOR_DB_PATH/diagnostics/",
    )
    parser.add_argument(
        "--force-tfidf",
        action="store_true",
        help="Skip ChromaDB even if installed; use local TF-IDF only",
    )
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 1

    diag_root = default_diagnostics_dir(settings)
    run_dir = (diag_root / args.diagnostics_run).resolve()
    chunks_dir = run_dir / "chunks"
    if not chunks_dir.is_dir():
        print(f"ERROR: chunks dir not found: {chunks_dir}", file=sys.stderr)
        return 1

    chunks = load_usable_chunks(chunks_dir)
    usable_count = len(chunks)
    count_note = None
    if usable_count != 19:
        count_note = (
            f"Expected 19 usable chunks from quality_fix report, found {usable_count}. "
            "Check diagnostics chunk JSON review_status filters."
        )

    by_sample: dict[str, int] = {}
    for c in chunks:
        by_sample[c.sample_label] = by_sample.get(c.sample_label, 0) + 1

    # Separate sample collection under vector DB path (not full production index).
    sample_root = settings.vector_db_path / "sample_collections" / COLLECTION_NAME
    sample_root.mkdir(parents=True, exist_ok=True)

    backend = "tfidf"
    model_name = None
    chroma_collection = None
    tfidf_path = sample_root / "local_tfidf_index.json"

    if not args.force_tfidf:
        chroma_persist = sample_root / "chroma"
        built = try_chromadb_index(persist_dir=chroma_persist, chunks=chunks)
        if built is not None:
            model_name, chroma_collection = built
            backend = "chromadb"

    if chroma_collection is None:
        idx = build_local_tfidf_index(chunks, tfidf_path)
        model_name = idx.model_name
        backend = "tfidf"
    else:
        # Also write a metadata manifest for audit (no second vector set).
        idx = None

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "collection_name": COLLECTION_NAME,
        "diagnostics_run": str(run_dir),
        "backend": backend,
        "model_name": model_name,
        "usable_chunk_count": usable_count,
        "usable_by_sample": by_sample,
        "count_note": count_note,
        "chunk_ids": [c.chunk_id for c in chunks],
        "forbidden_pages_excluded": {k: sorted(v) for k, v in FORBIDDEN_PAGES.items()},
    }
    (sample_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (sample_root / "usable_chunks_snapshot.json").write_text(
        json.dumps(
            [
                {
                    "chunk_id": c.chunk_id,
                    "sample_label": c.sample_label,
                    "source_relative_path": c.source_relative_path,
                    "pdf_pages": c.pdf_pages,
                    "clause_number": c.clause_number,
                    "review_status": c.review_status,
                    "text_sha256": c.text_sha256,
                    "text_version": c.text_version,
                    "text_preview": _preview(c.text, 160),
                }
                for c in chunks
            ],
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    search_results = []
    all_violations: list[str] = []

    for case in SEARCH_CASES:
        if backend == "chromadb":
            hits = query_chromadb(chroma_collection, case["query"], n_results=3)
        else:
            hits = idx.query(case["query"], n_results=3)  # type: ignore[union-attr]

        violations = assert_no_forbidden_hits(hits, forbidden_pages=FORBIDDEN_PAGES)
        all_violations.extend(violations)

        # Did we find something from the hinted sample among usable sources?
        found_in_hint = any(
            (case["sample_hint"] in (h.get("source_relative_path") or ""))
            or (
                case["sample_hint"] == "IS 9666" and h.get("sample_label") == "native_text"
            )
            or (
                case["sample_hint"] == "IS 2676" and h.get("sample_label") == "scanned"
            )
            for h in hits
        )

        formatted_hits = []
        for h in hits:
            formatted_hits.append(
                {
                    "chunk_id": h["chunk_id"],
                    "score": h.get("score"),
                    "clause_number": h.get("clause_number") or None,
                    "pdf_pages": h.get("pdf_pages"),
                    "source_relative_path": h.get("source_relative_path"),
                    "review_status": h.get("review_status"),
                    "text": h.get("text"),
                    "text_preview": _preview(h.get("text") or "", 280),
                }
            )

        search_results.append(
            {
                "id": case["id"],
                "query": case["query"],
                "sample_hint": case["sample_hint"],
                "expect_notes": case["expect_notes"],
                "found_in_hinted_sample": found_in_hint,
                "not_found_message": (
                    None
                    if found_in_hint
                    else (
                        f"जाँचे गए usable स्रोतों में '{case['sample_hint']}' "
                        "से संबंधित हिस्सा top results में नहीं मिला।"
                    )
                ),
                "violations": violations,
                "hits": formatted_hits,
            }
        )

    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "collection_name": COLLECTION_NAME,
        "sample_collection_path": str(sample_root),
        "backend": backend,
        "model_name": model_name,
        "usable_chunk_count": usable_count,
        "usable_by_sample": by_sample,
        "count_note": count_note,
        "searches": search_results,
        "forbidden_page_violations": all_violations,
        "command": (
            f'{_REPO_ROOT / "knowledge_engine" / ".conda" / "bin" / "python"} '
            f"-m knowledge_engine.scripts.run_usable_vector_search_test "
            f"--diagnostics-run {args.diagnostics_run}"
        ),
    }

    # Save under diagnostics run + sample collection
    out_diag = run_dir / "vector_search_test"
    out_diag.mkdir(parents=True, exist_ok=True)
    report_path = out_diag / "usable_vector_search_report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (sample_root / "usable_vector_search_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    # Console summary
    print(json.dumps(
        {
            "usable_chunk_count": usable_count,
            "count_note": count_note,
            "backend": backend,
            "model_name": model_name,
            "collection": COLLECTION_NAME,
            "sample_collection_path": str(sample_root),
            "report": str(report_path),
            "forbidden_violations": all_violations,
            "searches": [
                {
                    "id": s["id"],
                    "found_in_hinted_sample": s["found_in_hinted_sample"],
                    "top": [
                        {
                            "chunk_id": h["chunk_id"],
                            "clause": h["clause_number"],
                            "pages": h["pdf_pages"],
                            "preview": h["text_preview"][:120],
                        }
                        for h in s["hits"][:2]
                    ],
                }
                for s in search_results
            ],
        },
        indent=2,
        ensure_ascii=False,
    ))
    return 1 if all_violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
