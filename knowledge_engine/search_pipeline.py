"""
Controlled hybrid search pipeline (read-only collections).

Uses experimental multilingual Chroma when available; never deletes/overwrites
production bis_two_sample_usable_v1.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from knowledge_engine.answerability import (
    MSG_NOT_FOUND_HI,
    evaluate_answerability,
)
from knowledge_engine.hybrid_retrieval import (
    distance_to_similarity,
    hybrid_rank,
    lexical_score_chunks,
)
from knowledge_engine.local_vector_test import (
    COLLECTION_NAME,
    default_chroma_persist_dir,
    is_number_from_source_path,
    open_existing_chroma_collection,
)
from knowledge_engine.pilot.alias_policy import (
    ContentIdentityRecord,
    dedupe_search_hits_by_content,
    try_load_alias_records_for_search,
)

FORBIDDEN = {
    "scanned": {8},
}

# Legacy chroma where (baseline collections). Pilot filters in Python via matches_standard().
STANDARD_FILTERS: dict[str, dict[str, str] | None] = {
    "all": None,
    "IS 9666": {"sample_label": "native_text"},
    "IS 2676": {"sample_label": "scanned"},
}

STANDARD_TO_IS = {
    "native_text": "IS 9666",
    "scanned": "IS 2676",
}


def standard_key(value: str | None) -> str:
    raw = (value or "all").strip()
    if not raw or raw.lower() in ("all", "सभी", "*"):
        return "all"
    normalized = _normalize_is_number(raw)
    if normalized:
        return normalized
    if raw in STANDARD_FILTERS:
        return raw
    return raw


def parse_pages(raw: Any) -> list[int]:
    if isinstance(raw, list):
        out: list[int] = []
        for x in raw:
            try:
                out.append(int(x))
            except (TypeError, ValueError):
                continue
        return out
    if isinstance(raw, str):
        try:
            return parse_pages(json.loads(raw))
        except json.JSONDecodeError:
            return []
    return []


def is_forbidden(sample_label: str, pages: list[int], review_status: str) -> bool:
    if (review_status or "").strip() and review_status != "usable":
        return True
    bad = FORBIDDEN.get(sample_label or "", set())
    return bool(bad.intersection(pages))


def _normalize_is_number(value: str | None) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return None
    m = re.search(r"IS\s*(\d+)", raw, re.I)
    if m:
        return f"IS {m.group(1)}"
    return None


def verified_is_number(ch: dict[str, Any]) -> str | None:
    """Prefer chunk metadata is_number; do not invent from folder guesses alone."""
    meta_is = _normalize_is_number(ch.get("is_number") if isinstance(ch.get("is_number"), str) else None)
    if meta_is:
        return meta_is
    # Legacy baseline labels only (known verified mapping) — not path guessing.
    sample = (ch.get("sample_label") or "")
    if sample in STANDARD_TO_IS:
        return STANDARD_TO_IS[sample]
    return None


def matches_standard(ch: dict[str, Any], std: str) -> bool:
    """Hard standard constraint for baseline + pilot corpora.

    Prefer verified ``is_number`` metadata. Path/folder inference is used only as a
    legacy fallback for the two known baseline standards when metadata is empty.
    Unknown standards without metadata do not silently match.
    """
    if std == "all":
        return True
    want = _normalize_is_number(std) or std.strip()
    got = verified_is_number(ch)
    if got:
        return got == want

    # Legacy fallback for older chunks missing is_number (baseline two-sample only).
    rel = (ch.get("source_relative_path") or "")
    sample = (ch.get("sample_label") or "")
    if want == "IS 9666":
        return "9666" in rel or sample == "native_text"
    if want == "IS 2676":
        return "2676" in rel or sample == "scanned"
    # Do not path-guess arbitrary standards.
    return False


def experimental_chroma_dir(vector_db_path: Path) -> Path:
    from knowledge_engine.scripts.compare_multilingual_ranking import EXPERIMENTAL_COLLECTION

    # Same layout as compare_hybrid_retrieval / compare_multilingual_ranking
    return vector_db_path / "sample_collections" / EXPERIMENTAL_COLLECTION / "chroma"


def pilot_chroma_dir(vector_db_path: Path) -> Path:
    from knowledge_engine.pilot.constants import PILOT_COLLECTION_NAME

    return vector_db_path / "sample_collections" / PILOT_COLLECTION_NAME / "chroma"


def open_search_collection(vector_db_path: Path) -> tuple[str, Any, str, Path]:
    """
    Prefer pilot multilingual collection when present; else experimental; else MiniLM.
    Never writes. Protected collections are opened read-only only as fallbacks.
    Returns (model_label, collection, collection_name, persist_dir).
    """
    from knowledge_engine.pilot.constants import PILOT_COLLECTION_NAME, PILOT_EMBEDDING_MODEL
    from knowledge_engine.scripts.compare_multilingual_ranking import (
        EXPERIMENTAL_COLLECTION,
        FastEmbedMultilingualEF,
        MULTILINGUAL_MODEL,
    )
    import chromadb

    pilot = pilot_chroma_dir(vector_db_path)
    if pilot.is_dir():
        try:
            client = chromadb.PersistentClient(path=str(pilot))
            ef = FastEmbedMultilingualEF(PILOT_EMBEDDING_MODEL)
            col = client.get_collection(PILOT_COLLECTION_NAME, embedding_function=ef)
            if col.count() > 0:
                return (
                    f"fastembed:{PILOT_EMBEDDING_MODEL}",
                    col,
                    PILOT_COLLECTION_NAME,
                    pilot,
                )
        except Exception:
            pass

    exp = experimental_chroma_dir(vector_db_path)
    if exp.is_dir():
        try:
            client = chromadb.PersistentClient(path=str(exp))
            ef = FastEmbedMultilingualEF(MULTILINGUAL_MODEL)
            col = client.get_collection(EXPERIMENTAL_COLLECTION, embedding_function=ef)
            if col.count() > 0:
                return (
                    f"fastembed:{MULTILINGUAL_MODEL}",
                    col,
                    EXPERIMENTAL_COLLECTION,
                    exp,
                )
        except Exception:
            pass

    persist = default_chroma_persist_dir(vector_db_path)
    model_name, col = open_existing_chroma_collection(persist_dir=persist)
    return model_name, col, COLLECTION_NAME, persist


def list_verified_standards(collection: Any) -> list[dict[str, str]]:
    """Build standards list from verified is_number metadata in the open collection."""
    raw = collection.get(include=["metadatas"])
    metas = raw.get("metadatas") or []
    found: set[str] = set()
    for meta in metas:
        meta = meta or {}
        review = meta.get("review_status") or "usable"
        if review != "usable":
            continue
        ch = {
            "is_number": meta.get("is_number"),
            "sample_label": meta.get("sample_label"),
            "source_relative_path": meta.get("source_relative_path"),
        }
        is_no = verified_is_number(ch)
        if is_no:
            found.add(is_no)
    return [{"id": s, "label": s} for s in sorted(found, key=lambda x: (len(x), x))]


def load_pool_chunks(
    collection: Any,
    *,
    standard: str,
) -> list[dict[str, Any]]:
    """All usable chunks in the candidate set after hard standard filter."""
    std = standard_key(standard)
    # ``all`` and any verified IS number are allowed; reject empty.
    if not std:
        raise ValueError("unknown_standard:empty")

    # Always load full usable set then filter in Python (pilot sample_labels vary).
    raw = collection.get(include=["documents", "metadatas"])
    ids = raw.get("ids") or []
    docs = raw.get("documents") or []
    metas = raw.get("metadatas") or []
    pool: list[dict[str, Any]] = []
    for i, cid in enumerate(ids):
        meta = metas[i] or {}
        pages = parse_pages(meta.get("pdf_pages"))
        review = meta.get("review_status") or "usable"
        sample_label = meta.get("sample_label") or ""
        if is_forbidden(sample_label, pages, review):
            continue
        # Also forbid IS 2676 page 8 by path even if sample_label differs (pilot)
        rel = meta.get("source_relative_path") or ""
        if ("2676" in rel or rel.startswith("STD 21/")) and 8 in pages:
            continue
        clause = meta.get("clause_number") or None
        if clause == "":
            clause = None
        # Prefer stored metadata; path inference only as last-resort label for display,
        # never as invented filter authority for unknown standards.
        is_no = meta.get("is_number") or STANDARD_TO_IS.get(sample_label) or ""
        if not is_no:
            inferred = is_number_from_source_path(rel)
            # Keep inferred only for known legacy baselines when metadata empty.
            if inferred in ("IS 9666", "IS 2676"):
                is_no = inferred
        row = {
            "chunk_id": cid,
            "text": docs[i] or "",
            "clause_number": clause,
            "pdf_pages": pages,
            "source_relative_path": rel,
            "review_status": review,
            "sample_label": sample_label,
            "is_number": is_no,
        }
        if not matches_standard(row, std):
            continue
        pool.append(row)
    return pool


def assemble_hybrid_search_results(
    *,
    query: str,
    standard: str,
    limit: int,
    ranked_hits: list[dict[str, Any]],
    alias_records: list[ContentIdentityRecord] | None = None,
    answerability_public: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Shared result-assembly path used by run_hybrid_search and mock tests.

    Applies content/chunk alias dedupe before building public results so A/B
    aliases do not produce duplicate evidence hits.
    """
    q = (query or "").strip()
    std = standard_key(standard)
    records = alias_records
    if records is None:
        records = try_load_alias_records_for_search()

    deduped = dedupe_search_hits_by_content(list(ranked_hits), alias_records=records)
    # Re-number ranks after dedupe
    for i, h in enumerate(deduped):
        h["rank"] = i + 1

    if answerability_public is None:
        ans = evaluate_answerability(
            query=q,
            ranked_hits=deduped[: max(limit, 3)],
            selected_standard=std,
        )
        pub = ans.to_public_dict()
    else:
        pub = answerability_public

    top = deduped[:limit]
    evidence = []
    for h in top:
        evidence.append(
            {
                "chunk_id": h["chunk_id"],
                "text": h.get("text"),
                "standard": h.get("is_number"),
                "clause": h.get("clause_number"),
                "pdf_pages": h.get("pdf_pages") or [],
                "review_status": h.get("review_status"),
                "rank": h.get("rank"),
                "sample_label": h.get("sample_label"),
                "source_relative_path": h.get("source_relative_path"),
                "source_aliases": h.get("source_aliases") or [],
                "path_std_contexts": h.get("path_std_contexts") or {},
                "alias_decision": h.get("alias_decision"),
                "content_document_id": h.get("content_document_id"),
            }
        )

    public_results = []
    for h in top:
        public_results.append(
            {
                "chunk_id": h["chunk_id"],
                "text": h.get("text"),
                "is_number": h.get("is_number"),
                "clause_number": h.get("clause_number"),
                "pdf_pages": h.get("pdf_pages") or [],
                "source_relative_path": h.get("source_relative_path"),
                "source_aliases": h.get("source_aliases") or [],
                "path_std_contexts": h.get("path_std_contexts") or {},
                "alias_decision": h.get("alias_decision"),
                "content_document_id": h.get("content_document_id"),
                "review_status": h.get("review_status"),
                "sample_label": h.get("sample_label"),
                "is_number_verified": h.get("is_number_verified", False),
                "is_number_metadata_status": h.get("is_number_metadata_status"),
                "rank": h.get("rank"),
                "_debug": {
                    "distance": h.get("distance"),
                    "vector_similarity": h.get("vector_similarity"),
                    "hybrid_score": h.get("hybrid_score"),
                    "lexical_raw": h.get("lexical_raw"),
                    "vector_rank": h.get("vector_rank"),
                },
            }
        )

    state = pub["answerability_state"]
    debug_nearest = public_results if state == "not_found" else []
    if state == "not_found":
        public_results = []
        evidence = []

    return {
        "ok": True,
        "query": q,
        "standard": std,
        "limit": limit,
        "result_count": len(public_results),
        "answerability_state": state,
        "message_hi": pub["message_hi"] if state != "supported" else (
            "जाँचा हुआ संबंधित स्रोत मिला।"
        ),
        "evidence_reasons": pub["evidence_reasons"],
        "signals_summary": pub["signals_summary"],
        "debug_scores": pub["debug_scores"],
        "debug_nearest": debug_nearest,
        "results": public_results,
        "evidence_chunks": evidence,
        "alias_dedupe_applied": True,
        "ranked_before_dedupe": len(ranked_hits),
        "ranked_after_dedupe": len(deduped),
        "disclaimer_hi": (
            "परीक्षण/पायलट: खोज usable अंशों पर आधारित है। "
            "यह पूरे BIS library की पूर्ण खोज नहीं है।"
        ),
        "note_hi": (
            "परिणाम केवल usable अंशों से हैं। मिलान क्रम उत्तर की शुद्धता का प्रतिशत नहीं है। "
            "AI-generated उत्तर अभी नहीं बनाया जाता।"
        ),
    }


def run_hybrid_search(
    *,
    collection: Any,
    query: str,
    standard: str = "all",
    limit: int = 5,
    alias_records: list[ContentIdentityRecord] | None = None,
) -> dict[str, Any]:
    """
    Vector query → hard standard filter → hybrid re-rank → alias dedupe → answerability.
    """
    q = (query or "").strip()
    std = standard_key(standard)
    if std not in STANDARD_FILTERS:
        return {
            "ok": False,
            "error_code": "unknown_standard",
            "message_hi": "अज्ञात standard चयन। IS 9666, IS 2676 या सभी चुनें।",
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }
    if not q:
        return {
            "ok": False,
            "error_code": "empty_query",
            "message_hi": "कृपया खोज के लिए सवाल लिखें।",
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }

    pool = load_pool_chunks(collection, standard=std)
    if not pool:
        ans = evaluate_answerability(query=q, ranked_hits=[], selected_standard=std)
        pub = ans.to_public_dict()
        return {
            "ok": True,
            "query": q,
            "standard": std,
            "limit": limit,
            "result_count": 0,
            "answerability_state": pub["answerability_state"],
            "message_hi": pub["message_hi"],
            "evidence_reasons": pub["evidence_reasons"],
            "signals_summary": pub["signals_summary"],
            "debug_scores": pub["debug_scores"],
            "results": [],
            "evidence_chunks": [],
            "alias_dedupe_applied": True,
            "ranked_before_dedupe": 0,
            "ranked_after_dedupe": 0,
        }

    n = min(max(len(pool), limit), min(len(pool) or limit, 50))
    # Query without chroma where — hard filter already applied on pool ids
    raw = collection.query(query_texts=[q], n_results=n)
    ids = (raw.get("ids") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    vec_ids: list[str] = []
    dist_by: dict[str, float | None] = {}
    for i, cid in enumerate(ids):
        vec_ids.append(cid)
        dist_by[cid] = dists[i] if i < len(dists) else None
    pool_ids = [c["chunk_id"] for c in pool]
    for cid in pool_ids:
        if cid not in vec_ids:
            vec_ids.append(cid)

    # Enforce hard filter on vector ids (defense in depth)
    allowed = set(pool_ids)
    vec_ids = [cid for cid in vec_ids if cid in allowed]

    lex = lexical_score_chunks(q, pool)
    ranked = hybrid_rank(vector_ranked_ids=vec_ids, lexical=lex, chunk_ids=pool_ids)
    by_id = {c["chunk_id"]: c for c in pool}

    ranked_hits: list[dict[str, Any]] = []
    for i, (cid, final, detail) in enumerate(ranked):
        ch = by_id[cid]
        dist = dist_by.get(cid)
        ranked_hits.append(
            {
                **ch,
                "rank": i + 1,
                "hybrid_score": final,
                "final_score": final,
                "distance": dist,
                "vector_similarity": distance_to_similarity(dist),
                "vector_rank": (vec_ids.index(cid) + 1) if cid in vec_ids else None,
                "lexical_raw": detail.get("lexical_raw"),
                "lexical_norm": detail.get("lexical_norm"),
                "rrf": detail.get("rrf"),
                "score_components": detail,
            }
        )

    return assemble_hybrid_search_results(
        query=q,
        standard=std,
        limit=limit,
        ranked_hits=ranked_hits,
        alias_records=alias_records,
    )
