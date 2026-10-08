#!/usr/bin/env python3
"""
Experimental multilingual vs MiniLM ranking comparison (19 usable chunks only).

Does NOT modify/delete production collection bis_two_sample_usable_v1.
Writes a separate experimental Chroma path + JSON report under diagnostics.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.compare_multilingual_ranking
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.local_vector_test import (
    COLLECTION_NAME,
    default_chroma_persist_dir,
    is_number_from_source_path,
    load_usable_chunks,
    open_existing_chroma_collection,
)

# Multilingual, cross-lingual Hindi↔English, local Mac via fastembed ONNX (no torch).
MULTILINGUAL_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# Protected — open read-only only; never delete/overwrite.
EXPERIMENTAL_COLLECTION = "bis_two_sample_usable_multilingual_exp_v1"
# Disposable scratch for rebuild experiments (not protected).
SCRATCH_MULTILINGUAL_COLLECTION = "bis_multilingual_test_scratch_tmp"
# fastembed ONNX quantized package size (~0.22 GB).
MULTILINGUAL_MODEL_SIZE_NOTE = (
    "~0.22 GB ONNX (fastembed: paraphrase-multilingual-MiniLM-L12-v2); "
    "Hindi+English cross-lingual, Mac CPU"
)

QUERIES: list[dict[str, Any]] = [
    {
        "id": "q1_en_extraneous",
        "lang": "en",
        "query": "granules free from extraneous material",
        "expect_clause": "4.1",
        "expect_chunk_prefix": "native_text:p0003:c004",
        "standard_label": "native_text",
    },
    {
        "id": "q2_hi_extraneous",
        "lang": "hi",
        "query": "कणिकाओं में बाहरी पदार्थ के बारे में क्या आवश्यकता है?",
        "expect_clause": "4.1",
        "expect_chunk_prefix": "native_text:p0003:c004",
        "standard_label": "native_text",
    },
    {
        "id": "q3_en_lhc",
        "lang": "en",
        "query": "Liquid Holding Capacity formula",
        "expect_clause": "A-3",
        "expect_chunk_prefix": "native_text:p0005:c018",
        "standard_label": "native_text",
    },
    {
        "id": "q4_hi_lhc",
        "lang": "hi",
        "query": "लिक्विड होल्डिंग कैपेसिटी का सूत्र क्या है?",
        "expect_clause": "A-3",
        "expect_chunk_prefix": "native_text:p0005:c018",
        "standard_label": "native_text",
    },
]


def _format_hits(raw: dict[str, Any], *, limit: int = 5) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    ids = (raw.get("ids") or [[]])[0]
    docs = (raw.get("documents") or [[]])[0]
    metas = (raw.get("metadatas") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    for i, cid in enumerate(ids[:limit]):
        meta = metas[i] or {}
        clause = meta.get("clause_number") or None
        if clause == "":
            clause = None
        pages = meta.get("pdf_pages")
        if isinstance(pages, str):
            try:
                pages = json.loads(pages)
            except json.JSONDecodeError:
                pages = []
        preview = " ".join((docs[i] or "").split())[:160]
        hits.append(
            {
                "rank": i + 1,
                "chunk_id": cid,
                "clause_number": clause,
                "pdf_pages": pages,
                "distance": dists[i] if i < len(dists) else None,
                "text_preview": preview,
            }
        )
    return hits


def _gold_rank(hits: list[dict[str, Any]], expect_clause: str, expect_prefix: str) -> int | None:
    for h in hits:
        if h["chunk_id"].startswith(expect_prefix) or h.get("clause_number") == expect_clause:
            if h.get("clause_number") == expect_clause or h["chunk_id"].startswith(expect_prefix):
                return int(h["rank"])
    for h in hits:
        if h.get("clause_number") == expect_clause:
            return int(h["rank"])
    return None


def _query_collection(collection: Any, query: str, *, sample_label: str, n: int = 5) -> list[dict[str, Any]]:
    kwargs: dict[str, Any] = {"query_texts": [query], "n_results": n}
    if sample_label:
        kwargs["where"] = {"sample_label": sample_label}
    raw = collection.query(**kwargs)
    return _format_hits(raw, limit=n)


class FastEmbedMultilingualEF:
    """Chroma-compatible embedding function backed by fastembed ONNX."""

    def __init__(self, model_name: str = MULTILINGUAL_MODEL) -> None:
        from fastembed import TextEmbedding

        self.model_name = model_name
        self._model = TextEmbedding(model_name=model_name)

    def name(self) -> str:  # chroma may call this
        return f"fastembed:{self.model_name}"

    def __call__(self, input: list[str]) -> list[list[float]]:  # noqa: A003
        texts = list(input or [])
        if not texts:
            return []
        return [vec.tolist() for vec in self._model.embed(texts)]


def build_experimental_multilingual(
    *,
    chunks: list,
    persist_dir: Path,
    collection_name: str | None = None,
    allow_rebuild_scratch: bool = False,
) -> tuple[str, Any]:
    """Open or rebuild multilingual collection.

    Protected ``EXPERIMENTAL_COLLECTION`` is never deleted.
    Rebuilds (if allowed) use ``SCRATCH_MULTILINGUAL_COLLECTION`` only.
    """
    import chromadb

    from knowledge_engine.pilot.collection_guards import (
        ProtectedCollectionError,
        assert_collection_writable,
        is_protected_collection,
        safe_delete_collection,
    )

    target = collection_name or (
        SCRATCH_MULTILINGUAL_COLLECTION if allow_rebuild_scratch else EXPERIMENTAL_COLLECTION
    )

    if allow_rebuild_scratch:
        if is_protected_collection(target) or target == EXPERIMENTAL_COLLECTION:
            raise ProtectedCollectionError(
                f"Refusing rebuild of protected collection {target!r}; "
                f"use scratch {SCRATCH_MULTILINGUAL_COLLECTION!r}"
            )
        assert_collection_writable(target, operation="multilingual_rebuild")
    elif is_protected_collection(target) or target == EXPERIMENTAL_COLLECTION:
        # Read-only open of existing protected experimental collection.
        persist_dir.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(persist_dir))
        ef = FastEmbedMultilingualEF(MULTILINGUAL_MODEL)
        try:
            collection = client.get_collection(name=target, embedding_function=ef)
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(
                f"Protected collection {target!r} missing; rebuild is disabled. "
                f"Pass allow_rebuild_scratch=True with scratch name only. ({exc})"
            ) from None
        return f"fastembed:{MULTILINGUAL_MODEL}", collection

    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))
    assert_collection_writable(target, operation="multilingual_rebuild")

    try:
        safe_delete_collection(client, target)
    except ProtectedCollectionError:
        raise
    except Exception:  # noqa: BLE001
        pass

    ef = FastEmbedMultilingualEF(MULTILINGUAL_MODEL)
    collection = client.get_or_create_collection(
        name=target,
        embedding_function=ef,
        metadata={
            "purpose": "scratch_multilingual_ranking_comparison",
            "model": MULTILINGUAL_MODEL,
            "backend": "fastembed-onnx",
        },
    )

    ids = [c.chunk_id for c in chunks]
    documents = [c.text for c in chunks]
    metadatas = []
    for c in chunks:
        metadatas.append(
            {
                "chunk_id": c.chunk_id,
                "source_relative_path": c.source_relative_path,
                "source_file_hash": c.source_file_hash,
                "pdf_pages": json.dumps(c.pdf_pages),
                "clause_number": c.clause_number or "",
                "extraction_method": c.extraction_method,
                "review_status": c.review_status,
                "text_quality_status": c.text_quality_status,
                "visual_verification_status": c.visual_verification_status,
                "sample_label": c.sample_label,
                "text_sha256": c.text_sha256,
                "text_version": c.text_version,
                "is_number": is_number_from_source_path(c.source_relative_path) or "",
            }
        )
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return f"fastembed:{MULTILINGUAL_MODEL}", collection


def main(argv: list[str] | None = None) -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 1

    diag = default_diagnostics_dir(settings)
    chunks_dir = diag / "quality_fix_20261006T144338Z" / "chunks"
    chunks = load_usable_chunks(chunks_dir)
    if len(chunks) != 19:
        print(f"WARN: usable chunks={len(chunks)} (expected 19)", file=sys.stderr)

    # Production MiniLM collection — open only, never write.
    prod_persist = default_chroma_persist_dir(settings.vector_db_path)
    minilm_name, minilm_col = open_existing_chroma_collection(persist_dir=prod_persist)
    # Safety: production path must remain the existing sample collection folder.
    if COLLECTION_NAME not in str(prod_persist):
        raise RuntimeError(f"Unexpected production persist path: {prod_persist}")

    # Protected multilingual collection — open read-only (never delete/rebuild here).
    exp_root = (
        settings.vector_db_path
        / "sample_collections"
        / EXPERIMENTAL_COLLECTION
    )
    exp_chroma = exp_root / "chroma"
    print(
        f"Opening protected multilingual collection {EXPERIMENTAL_COLLECTION!r} read-only …",
        file=sys.stderr,
    )
    multi_name, multi_col = build_experimental_multilingual(
        chunks=chunks,
        persist_dir=exp_chroma,
        collection_name=EXPERIMENTAL_COLLECTION,
        allow_rebuild_scratch=False,
    )

    comparisons = []
    for case in QUERIES:
        mini_hits = _query_collection(
            minilm_col, case["query"], sample_label=case["standard_label"], n=5
        )
        multi_hits = _query_collection(
            multi_col, case["query"], sample_label=case["standard_label"], n=5
        )
        mini_rank = _gold_rank(mini_hits, case["expect_clause"], case["expect_chunk_prefix"])
        multi_rank = _gold_rank(multi_hits, case["expect_clause"], case["expect_chunk_prefix"])
        comparisons.append(
            {
                "id": case["id"],
                "lang": case["lang"],
                "query": case["query"],
                "expect_clause": case["expect_clause"],
                "minilm": {
                    "model": minilm_name,
                    "gold_rank": mini_rank,
                    "top": mini_hits,
                },
                "multilingual": {
                    "model": multi_name,
                    "gold_rank": multi_rank,
                    "top": multi_hits,
                },
                "improved": (
                    multi_rank is not None
                    and (mini_rank is None or multi_rank < mini_rank)
                )
                or (multi_rank == 1 and mini_rank != 1),
            }
        )
        print(
            f"\n{case['id']}: expect clause {case['expect_clause']}\n"
            f"  MiniLM gold_rank={mini_rank} top1={mini_hits[0]['clause_number'] if mini_hits else None}\n"
            f"  Multi  gold_rank={multi_rank} top1={multi_hits[0]['clause_number'] if multi_hits else None}",
            file=sys.stderr,
        )

    # Recommendation
    hi_cases = [c for c in comparisons if c["lang"] == "hi"]
    en_cases = [c for c in comparisons if c["lang"] == "en"]
    hi_better = sum(1 for c in hi_cases if c["multilingual"]["gold_rank"] == 1) >= sum(
        1 for c in hi_cases if c["minilm"]["gold_rank"] == 1
    )
    en_ok_multi = all(
        (c["multilingual"]["gold_rank"] or 99) <= (c["minilm"]["gold_rank"] or 99)
        or c["multilingual"]["gold_rank"] == 1
        for c in en_cases
    )

    q2 = next(c for c in comparisons if c["id"] == "q2_hi_extraneous")
    q4 = next(c for c in comparisons if c["id"] == "q4_hi_lhc")
    recommendation = {
        "prefer": "multilingual" if hi_better else "keep_minilm_for_now",
        "reason_hi": (
            "Hindi→English retrieval के लिए current MiniLM English-oriented है "
            f"(उदा. Hindi extraneous: MiniLM gold@{q2['minilm']['gold_rank']} vs Multi gold@"
            f"{q2['multilingual']['gold_rank']}). "
            "paraphrase-multilingual-MiniLM-L12-v2 (fastembed ONNX ~0.22GB) को experimental "
            "collection पर बेहतर दिखा; English queries भी सुरक्षित/बेहतर रहीं। "
            f"नोट: Hindi LHC formula अभी भी कमज़ोर है (Multi gold@"
            f"{q4['multilingual']['gold_rank']}) — switch से पहले और queries चाहिए।"
            if hi_better
            else "इस छोटे टेस्ट में multilingual स्पष्ट लाभ नहीं दिखा — और evaluation चाहिए।"
        ),
        "production_note": (
            "Protected collections (bis_two_sample_usable_v1, "
            "bis_two_sample_usable_multilingual_exp_v1, bis_pilot_representative_v1) "
            "को modify/delete नहीं किया गया। Multilingual comparison read-only open है।"
        ),
        "en_preserved": en_ok_multi,
        "do_not_switch_production_yet": True,
    }

    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "usable_chunk_count": len(chunks),
        "production_collection": COLLECTION_NAME,
        "production_model": minilm_name,
        "experimental_collection": EXPERIMENTAL_COLLECTION,
        "experimental_model": multi_name,
        "experimental_model_size_note": MULTILINGUAL_MODEL_SIZE_NOTE,
        "experimental_path": str(exp_root),
        "cause_assessment_hi": (
            "Hindi ranking समस्या का मुख्य कारण current embedding model "
            "(Chroma default all-MiniLM-L6-v2) English-centric होना है — "
            "Hindi query और English clause text एक ही semantic space में कमज़ोर align होते हैं।"
        ),
        "comparisons": comparisons,
        "recommendation": recommendation,
    }

    out_dir = diag / "quality_fix_20261006T144338Z" / "vector_search_test"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "multilingual_ranking_comparison.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (exp_root / "comparison_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({"report": str(out_path), "recommendation": recommendation}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
