#!/usr/bin/env python3
"""
Controlled A/B/C retrieval comparison on 19 usable chunks.

A = production MiniLM (bis_two_sample_usable_v1) — read-only
B = multilingual FastEmbed vector-only (experimental collection) — read-only
C = multilingual FastEmbed + local hybrid (lexical) ranking

Does not download models, does not modify production collection.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.compare_hybrid_retrieval
"""

from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.hybrid_retrieval import (
    distance_to_similarity,
    expand_query_terms,
    hybrid_rank,
    lexical_score_chunks,
)
from knowledge_engine.local_vector_test import (
    COLLECTION_NAME,
    default_chroma_persist_dir,
    load_usable_chunks,
    open_existing_chroma_collection,
)
from knowledge_engine.scripts.compare_multilingual_ranking import (
    EXPERIMENTAL_COLLECTION,
    FastEmbedMultilingualEF,
    MULTILINGUAL_MODEL,
)

# --- Test definitions (answers must exist in the 19 usable chunks) ---

BASELINE: list[dict[str, Any]] = [
    {
        "id": "b1_en_extraneous",
        "query": "granules free from extraneous material",
        "expect_clause": "4.1",
        "expect_chunk_id": "native_text:p0003:c004",
        "sample_label": "native_text",
    },
    {
        "id": "b2_hi_extraneous",
        "query": "कणिकाओं में बाहरी पदार्थ के बारे में क्या आवश्यकता है?",
        "expect_clause": "4.1",
        "expect_chunk_id": "native_text:p0003:c004",
        "sample_label": "native_text",
    },
    {
        "id": "b3_en_lhc",
        "query": "Liquid Holding Capacity formula",
        "expect_clause": "A-3",
        "expect_chunk_id": "native_text:p0005:c018",
        "sample_label": "native_text",
    },
    {
        "id": "b4_hi_lhc",
        "query": "लिक्विड होल्डिंग कैपेसिटी का सूत्र क्या है?",
        "expect_clause": "A-3",
        "expect_chunk_id": "native_text:p0005:c018",
        "sample_label": "native_text",
    },
]

REGRESSION: list[dict[str, Any]] = [
    {
        "id": "r1_binders",
        "query": "blank granules may contain binder stabilizer activator",
        "expect_clause": "4.1.1",
        "expect_chunk_id": "native_text:p0003:c005",
        "sample_label": "native_text",
    },
    {
        "id": "r2_packing",
        "query": "packed in polypropylene or HDPE bags",
        "expect_clause": "4.2",
        "expect_chunk_id": "native_text:p0003:c006",
        "sample_label": "native_text",
    },
    {
        "id": "r3_marking",
        "query": "container shall bear Batch No and net mass",
        "expect_clause": "6.1",
        "expect_chunk_id": "native_text:p0003:c007",
        "sample_label": "native_text",
    },
    {
        "id": "r4_annex_title",
        "query": "DETERMINATION OF LIQUID HOLDING CAPACITY LHC",
        "expect_clause": "ANNEX A",
        "expect_chunk_id": "native_text:p0005:c014",
        "sample_label": "native_text",
    },
    {
        "id": "r5_principle",
        "query": "maximum loading of a technical formulation on blank granule",
        "expect_clause": "A-1",
        "expect_chunk_id": "native_text:p0005:c015",
        "sample_label": "native_text",
    },
    {
        "id": "r6_procedure",
        "query": "Take 20 g of sample in a 250 ml bottle burette",
        "expect_clause": "A-2.2",
        "expect_chunk_id": "native_text:p0005:c017",
        "sample_label": "native_text",
    },
    {
        "id": "r7_scope_aluminium",
        "query": "dimensions and tolerances for wrought aluminium sheet and strip",
        "expect_clause": "1.1",
        "expect_chunk_id": "scanned:p0007:c011",
        "sample_label": "scanned",
    },
    {
        "id": "r8_history_1964",
        "query": "This standard was first published in 1964",
        "expect_clause": "0.2",
        "expect_chunk_id": "scanned:p0007:c007",
        "sample_label": "scanned",
    },
    {
        "id": "r9_mixed_lhc_hi_en",
        "query": "LHC का calculation formula M M1",
        "expect_clause": "A-3",
        "expect_chunk_id": "native_text:p0005:c018",
        "sample_label": "native_text",
    },
    {
        "id": "r10_mixed_aluminium",
        "query": "एल्युमिनियम alloys sheet and strip dimensions",
        "expect_clause": "1.1",
        "expect_chunk_id": "scanned:p0007:c011",
        "sample_label": "scanned",
    },
]

FALSE_POSITIVE: dict[str, Any] = {
    "id": "fp1_melting_point",
    "query": "What is the melting point of blank granules in IS 9666?",
    "expect_clause": None,
    "expect_chunk_id": None,
    "sample_label": "native_text",
    "note": "Answer is NOT present in the 19 usable chunks. Nearest neighbors must not be treated as verified answers.",
}


def _open_multilingual(persist_dir: Path) -> Any:
    import chromadb

    client = chromadb.PersistentClient(path=str(persist_dir))
    ef = FastEmbedMultilingualEF(MULTILINGUAL_MODEL)
    return client.get_collection(EXPERIMENTAL_COLLECTION, embedding_function=ef)


def _vector_query(
    collection: Any,
    query: str,
    *,
    sample_label: str | None,
    n: int,
) -> tuple[list[dict[str, Any]], float]:
    kwargs: dict[str, Any] = {"query_texts": [query], "n_results": n}
    if sample_label:
        kwargs["where"] = {"sample_label": sample_label}
    t0 = time.perf_counter()
    raw = collection.query(**kwargs)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    ids = (raw.get("ids") or [[]])[0]
    docs = (raw.get("documents") or [[]])[0]
    metas = (raw.get("metadatas") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    hits = []
    for i, cid in enumerate(ids):
        meta = metas[i] or {}
        clause = meta.get("clause_number") or None
        if clause == "":
            clause = None
        dist = dists[i] if i < len(dists) else None
        hits.append(
            {
                "rank": i + 1,
                "chunk_id": cid,
                "clause_number": clause,
                "distance": dist,
                "vector_similarity": distance_to_similarity(dist),
                "text_preview": " ".join((docs[i] or "").split())[:140],
            }
        )
    return hits, elapsed_ms


def _gold_rank(hits: list[dict[str, Any]], expect_chunk_id: str | None, expect_clause: str | None) -> int | None:
    if not expect_chunk_id and not expect_clause:
        return None
    for h in hits:
        if expect_chunk_id and h["chunk_id"] == expect_chunk_id:
            return int(h["rank"])
    for h in hits:
        if expect_clause and h.get("clause_number") == expect_clause:
            return int(h["rank"])
    return None


def _top5(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return hits[:5]


def run_case(
    case: dict[str, Any],
    *,
    minilm_col: Any,
    multi_col: Any,
    chunks_by_label: dict[str, list[dict]],
) -> dict[str, Any]:
    label = case.get("sample_label")
    pool = chunks_by_label.get(label or "", [])
    # Vector A
    a_hits, a_ms = _vector_query(minilm_col, case["query"], sample_label=label, n=min(10, max(5, len(pool) or 5)))
    # Vector B — fetch all labeled chunks for fair hybrid candidate set
    n_b = max(5, len(pool) or 5)
    b_hits, b_ms = _vector_query(multi_col, case["query"], sample_label=label, n=n_b)

    # Hybrid C
    t0 = time.perf_counter()
    lex = lexical_score_chunks(case["query"], pool)
    vec_ids = [h["chunk_id"] for h in b_hits]
    # Ensure all pool ids participate
    pool_ids = [c["chunk_id"] for c in pool]
    for cid in pool_ids:
        if cid not in vec_ids:
            vec_ids.append(cid)
    ranked = hybrid_rank(vector_ranked_ids=vec_ids, lexical=lex, chunk_ids=pool_ids)
    c_ms = (time.perf_counter() - t0) * 1000.0 + b_ms  # include vector query time used for ranks

    by_id = {c["chunk_id"]: c for c in pool}
    b_by_id = {h["chunk_id"]: h for h in b_hits}
    c_hits = []
    for i, (cid, final, detail) in enumerate(ranked[:5]):
        ch = by_id[cid]
        c_hits.append(
            {
                "rank": i + 1,
                "chunk_id": cid,
                "clause_number": ch.get("clause_number"),
                "final_score": final,
                "vector_rank": (vec_ids.index(cid) + 1) if cid in vec_ids else None,
                "vector_similarity": b_by_id.get(cid, {}).get("vector_similarity"),
                "distance": b_by_id.get(cid, {}).get("distance"),
                "lexical_raw": detail.get("lexical_raw"),
                "rrf": detail.get("rrf"),
                "text_preview": " ".join((ch.get("text") or "").split())[:140],
                "score_components": detail,
            }
        )

    expect_c = case.get("expect_chunk_id")
    expect_cl = case.get("expect_clause")
    a_rank = _gold_rank(a_hits, expect_c, expect_cl)
    b_rank = _gold_rank(b_hits, expect_c, expect_cl)
    c_rank = _gold_rank(c_hits, expect_c, expect_cl)

    return {
        "id": case["id"],
        "query": case["query"],
        "expect_clause": expect_cl,
        "expect_chunk_id": expect_c,
        "sample_label": label,
        "query_expansions": expand_query_terms(case["query"])[:20],
        "A_minilm": {
            "gold_rank": a_rank,
            "query_ms": round(a_ms, 2),
            "top5": _top5(a_hits),
        },
        "B_multilingual_vector": {
            "gold_rank": b_rank,
            "query_ms": round(b_ms, 2),
            "top5": _top5(b_hits),
        },
        "C_multilingual_hybrid": {
            "gold_rank": c_rank,
            "query_ms": round(c_ms, 2),
            "top5": c_hits,
        },
        "pass_at_1": {
            "A": a_rank == 1,
            "B": b_rank == 1,
            "C": c_rank == 1,
        },
    }


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 1

    diag = default_diagnostics_dir(settings)
    chunks = load_usable_chunks(diag / "quality_fix_20261006T144338Z" / "chunks")
    chunks_dicts = [
        {
            "chunk_id": c.chunk_id,
            "text": c.text,
            "clause_number": c.clause_number,
            "sample_label": c.sample_label,
            "pdf_pages": c.pdf_pages,
        }
        for c in chunks
    ]
    by_label: dict[str, list[dict]] = {"native_text": [], "scanned": []}
    for ch in chunks_dicts:
        by_label.setdefault(ch["sample_label"], []).append(ch)

    # A production — read only
    prod_persist = default_chroma_persist_dir(settings.vector_db_path)
    if COLLECTION_NAME not in str(prod_persist):
        raise RuntimeError(f"Refusing unexpected prod path: {prod_persist}")
    _, minilm_col = open_existing_chroma_collection(persist_dir=prod_persist)

    # B/C experimental multilingual — read only (must already exist)
    exp_chroma = (
        settings.vector_db_path
        / "sample_collections"
        / EXPERIMENTAL_COLLECTION
        / "chroma"
    )
    if not exp_chroma.is_dir():
        print(f"ERROR: experimental collection missing at {exp_chroma}", file=sys.stderr)
        return 1
    multi_col = _open_multilingual(exp_chroma)

    t_all = time.perf_counter()
    baseline_results = [
        run_case(c, minilm_col=minilm_col, multi_col=multi_col, chunks_by_label=by_label)
        for c in BASELINE
    ]
    regression_results = [
        run_case(c, minilm_col=minilm_col, multi_col=multi_col, chunks_by_label=by_label)
        for c in REGRESSION
    ]
    fp_result = run_case(
        FALSE_POSITIVE, minilm_col=minilm_col, multi_col=multi_col, chunks_by_label=by_label
    )
    total_ms = (time.perf_counter() - t_all) * 1000.0

    def _pass_fail(rows: list[dict]) -> dict[str, Any]:
        summary = {"A": 0, "B": 0, "C": 0, "total": len(rows)}
        detail = []
        for r in rows:
            pa = r["pass_at_1"]["A"]
            pb = r["pass_at_1"]["B"]
            pc = r["pass_at_1"]["C"]
            summary["A"] += int(pa)
            summary["B"] += int(pb)
            summary["C"] += int(pc)
            detail.append(
                {
                    "id": r["id"],
                    "expect_clause": r["expect_clause"],
                    "A_rank": r["A_minilm"]["gold_rank"],
                    "B_rank": r["B_multilingual_vector"]["gold_rank"],
                    "C_rank": r["C_multilingual_hybrid"]["gold_rank"],
                    "pass_A": pa,
                    "pass_B": pb,
                    "pass_C": pc,
                }
            )
        return {"pass_at_1_counts": summary, "cases": detail}

    # False-positive analysis: do not declare correctness; report scores of top hit
    fp_analysis = {
        "query": FALSE_POSITIVE["query"],
        "note": FALSE_POSITIVE["note"],
        "no_verified_answer_in_corpus": True,
        "systems": {
            "A": {
                "top1": (fp_result["A_minilm"]["top5"] or [None])[0],
                "interpretation": "nearest neighbor only — not a verified answer",
            },
            "B": {
                "top1": (fp_result["B_multilingual_vector"]["top5"] or [None])[0],
                "interpretation": "nearest neighbor only — not a verified answer",
            },
            "C": {
                "top1": (fp_result["C_multilingual_hybrid"]["top5"] or [None])[0],
                "interpretation": "nearest neighbor only — not a verified answer",
            },
        },
        "threshold_note": (
            "No similarity threshold hard-coded. Collect ranks/scores for later "
            "rejection strategy; do not treat top-1 as correct when gold is absent."
        ),
    }

    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "usable_chunk_count": len(chunks),
        "production_collection": COLLECTION_NAME,
        "experimental_collection": EXPERIMENTAL_COLLECTION,
        "multilingual_model": f"fastembed:{MULTILINGUAL_MODEL}",
        "hybrid_method": {
            "name": "RRF(vector_ranks, lexical_ranks) + mild lexical_norm nudge",
            "rrf_k": 60,
            "lexical_signals": [
                "deterministic bilingual phrase expansions (local)",
                "term hits",
                "multi-word phrase hits",
                "clause-id boost",
                "formula/LHC boost",
            ],
            "does_not_replace_semantic": True,
        },
        "timing_ms": {
            "total_wall": round(total_ms, 2),
            "note": "Per-case query_ms recorded under each system; includes Chroma query (+ hybrid fuse for C).",
        },
        "baseline": baseline_results,
        "baseline_summary": _pass_fail(baseline_results),
        "regression": regression_results,
        "regression_summary": _pass_fail(regression_results),
        "false_positive": {**fp_result, "analysis": fp_analysis},
        "recommendation_hi": (
            "Multilingual vector (B) Hindi extraneous सुधारता है; hybrid (C) technical/"
            "mixed phrases (LHC/सूत्र) पर और मदद कर सकता है। Production candidate तभी बनाएँ "
            "जब regression pass@1 स्थिर हो और false-positive rejection policy तय हो। "
            "अभी bis_two_sample_usable_v1 replace न करें।"
        ),
        "ui_formatting_note": (
            "Display-only normalizer already in frontend "
            "(normalizeKnowledgeDisplayText.ts); indexed text unchanged."
        ),
    }

    out_dir = (
        diag
        / "quality_fix_20261006T144338Z"
        / "vector_search_test"
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "hybrid_retrieval_comparison.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    exp_out = (
        settings.vector_db_path
        / "sample_collections"
        / EXPERIMENTAL_COLLECTION
        / "hybrid_retrieval_comparison.json"
    )
    exp_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Console table
    print("BASELINE gold ranks (A MiniLM / B Multi-vector / C Multi-hybrid):")
    for r in baseline_results:
        print(
            f"  {r['id']}: expect {r['expect_clause']} → "
            f"A={r['A_minilm']['gold_rank']} B={r['B_multilingual_vector']['gold_rank']} "
            f"C={r['C_multilingual_hybrid']['gold_rank']}"
        )
    rs = report["regression_summary"]["pass_at_1_counts"]
    print(f"REGRESSION pass@1: A={rs['A']}/{rs['total']} B={rs['B']}/{rs['total']} C={rs['C']}/{rs['total']}")
    print(f"report={out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
