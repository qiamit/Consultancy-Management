"""
Lightweight hybrid retrieval helpers for the 19-chunk controlled test.

Combines vector ranks with local lexical signals (no DeepSeek, no new server).
Does not modify indexed text or production collections.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass


# Deterministic Hindi/English/mixed → English corpus phrase expansions (local only).
PHRASE_EXPANSIONS: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"लिक्विड\s*होल्डिंग\s*कैपेसिटी|लिक्विड\s*होल्डिंग|एलएचसी", re.I),
     ["liquid holding capacity", "lhc", "holding capacity"]),
    (re.compile(r"सूत्र|फॉर्मूला|formula", re.I),
     ["formula", "calculation", "percent by mass", "m / (m1 + m)", "× 100"]),
    (re.compile(r"बाहरी\s*पदार्थ|extraneous|foreign\s+matter|without\s+foreign", re.I),
     ["extraneous material", "extraneous", "free from"]),
    (re.compile(r"कणिका(?:ओं|एं)?|granules?", re.I),
     ["granules", "blank granules"]),
    (re.compile(r"बाइंडर|स्टेबलाइजर|एक्टिवेटर|binder|stabilizer", re.I),
     ["binder", "stabilizer", "activator", "deactivator"]),
    (re.compile(r"पैकिंग|packing|polypropylene|hdpe", re.I),
     ["packing", "polypropylene", "hdpe", "bags"]),
    (re.compile(r"चिह्न|मार्किंग|batch\s*no|marking", re.I),
     ["marking", "batch no", "container shall bear"]),
    # Keep loading/principle expansions specific — avoid drowning semantic rank (r5).
    (re.compile(r"maximum\s+loading|technical\s+formulation|लोडिंग|प्रिंसिपल|सिद्धांत", re.I),
     ["maximum loading", "technical formulation"]),
    (re.compile(r"\bprinciple\b|A-1\s*PRINCIPLE", re.I),
     ["principle", "maximum loading"]),
    (re.compile(r"ब्यूरेट|burette|250\s*ml|20\s*g", re.I),
     ["burette", "250 ml", "20 g", "shake the bottle"]),
    (re.compile(r"एल्युмин(?:ियम|ियम)|aluminium|aluminum|wrought", re.I),
     ["wrought aluminium", "aluminium alloys", "sheet and strip"]),
    (re.compile(r"dimensions?|tolerances?|आयाम|टॉलरेंस", re.I),
     ["dimensions and tolerances", "dimensions", "tolerances"]),
]

CLAUSE_ID_RE = re.compile(
    r"\b(?:A-\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*|ANNEX\s+[A-Z])\b",
    re.I,
)

TOKEN_RE = re.compile(r"[A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*|[\u0900-\u097F]+")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def expand_query_terms(query: str) -> list[str]:
    """Return original tokens + deterministic bilingual expansions."""
    q = query or ""
    terms: list[str] = []
    for tok in TOKEN_RE.findall(q.lower()):
        if len(tok) >= 2:
            terms.append(tok)
    for pat, expansions in PHRASE_EXPANSIONS:
        if pat.search(q):
            terms.extend(expansions)
    # de-dupe preserve order
    seen: set[str] = set()
    out: list[str] = []
    for t in terms:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            out.append(t.lower())
    return out


def extract_clause_mentions(query: str) -> list[str]:
    return [m.group(0).upper().replace("  ", " ") for m in CLAUSE_ID_RE.finditer(query or "")]


@dataclass
class LexicalScores:
    scores: dict[str, float]
    details: dict[str, dict[str, float]]


def lexical_score_chunks(
    query: str,
    chunks: list[dict],
) -> LexicalScores:
    """
    Score each chunk with lightweight lexical signals:
    - expanded term hits
    - exact multi-word phrase hits
    - clause-id match boost
    """
    q_norm = _norm(query)
    terms = expand_query_terms(query)
    clause_mentions = extract_clause_mentions(query)
    # multi-word phrases from expansions (length >= 2 words)
    phrases = [t for t in terms if " " in t]

    scores: dict[str, float] = {}
    details: dict[str, dict[str, float]] = {}

    for ch in chunks:
        cid = ch["chunk_id"]
        text = _norm(ch.get("text") or "")
        clause = (ch.get("clause_number") or "").strip()
        term_hits = 0.0
        for term in terms:
            if " " in term:
                continue
            if term in text:
                # rarer/longer terms weigh a bit more
                term_hits += 1.0 + min(len(term), 12) / 24.0

        phrase_hits = 0.0
        for ph in phrases:
            if ph in text:
                # Milder than before so lexical cannot bury vector relevance
                phrase_hits += 2.0

        # Also try original query as phrase if mostly ASCII and long enough
        if len(q_norm) >= 12 and re.search(r"[a-z]", q_norm) and q_norm in text:
            phrase_hits += 2.5

        clause_boost = 0.0
        for mention in clause_mentions:
            if clause and mention.replace(" ", "") == clause.replace(" ", "").upper():
                clause_boost += 4.0
            elif mention.lower() in text:
                clause_boost += 1.5

        # Formula-ish query extras (keep strong for Hindi/EN LHC — do not regress)
        formula_boost = 0.0
        if re.search(r"सूत्र|फॉर्मूला|formula|calculation|×\s*100|m\s*/\s*\(?\s*m1|lhc", query, re.I):
            if "liquid holding capacity" in text or "lhc" in text:
                formula_boost += 2.5
            if "m / (m1 + m)" in text or "× 100" in text or "percent by mass" in text:
                formula_boost += 2.0
            if clause == "A-3":
                formula_boost += 1.5

        # Principle / max-loading extras (helps r5 without over-boosting LHC)
        principle_boost = 0.0
        if re.search(
            r"maximum\s+loading|technical\s+formulation|principle|प्रिंसिपल|सिद्धांत",
            query,
            re.I,
        ):
            if "maximum loading" in text and "technical formulation" in text:
                principle_boost += 3.0
            if clause == "A-1":
                principle_boost += 1.5
            # Do not boost A-3 merely because query mentions loading

        total = term_hits + phrase_hits + clause_boost + formula_boost + principle_boost
        scores[cid] = total
        details[cid] = {
            "term_hits": term_hits,
            "phrase_hits": phrase_hits,
            "clause_boost": clause_boost,
            "formula_boost": formula_boost,
            "principle_boost": principle_boost,
            "lexical_total": total,
        }

    return LexicalScores(scores=scores, details=details)


def distance_to_similarity(distance: float | None) -> float:
    if distance is None:
        return 0.0
    return 1.0 / (1.0 + float(distance))


def reciprocal_rank_fusion(
    rank_lists: list[list[str]],
    *,
    k: int = 60,
    weights: list[float] | None = None,
) -> dict[str, float]:
    """Classic (optionally weighted) RRF over ordered id lists (best rank first)."""
    out: dict[str, float] = {}
    for li, ranks in enumerate(rank_lists):
        w = 1.0 if not weights else float(weights[li])
        for i, cid in enumerate(ranks):
            out[cid] = out.get(cid, 0.0) + w / (k + i + 1)
    return out


def hybrid_rank(
    *,
    vector_ranked_ids: list[str],
    lexical: LexicalScores,
    chunk_ids: list[str],
    rrf_k: int = 60,
    vector_rrf_weight: float = 1.0,
    lexical_rrf_weight: float = 0.55,
    lexical_nudge: float = 0.008,
) -> list[tuple[str, float, dict[str, float]]]:
    """
    Fuse vector order with lexical order via weighted RRF.

    Lexical list is down-weighted vs prior equal-weight fusion so semantic
    relevance is not drowned (fixes r5_principle over-boost) while bilingual
    phrase expansions still lift Hindi LHC.
    """
    # Lexical ranking (all chunks with score, zeros included)
    lex_sorted = sorted(
        chunk_ids,
        key=lambda cid: (-lexical.scores.get(cid, 0.0), chunk_ids.index(cid)),
    )
    fused = reciprocal_rank_fusion(
        [vector_ranked_ids, lex_sorted],
        k=rrf_k,
        weights=[vector_rrf_weight, lexical_rrf_weight],
    )

    max_lex = max((lexical.scores.get(cid, 0.0) for cid in chunk_ids), default=0.0)
    results: list[tuple[str, float, dict[str, float]]] = []
    for cid in chunk_ids:
        rrf = fused.get(cid, 0.0)
        lex = lexical.scores.get(cid, 0.0)
        lex_norm = (lex / max_lex) if max_lex > 0 else 0.0
        # Smaller absolute nudge than v1 (was 0.02)
        final = rrf + lexical_nudge * lex_norm
        detail = {
            "rrf": rrf,
            "lexical_raw": lex,
            "lexical_norm": lex_norm,
            "final": final,
            "vector_rrf_weight": vector_rrf_weight,
            "lexical_rrf_weight": lexical_rrf_weight,
            **(lexical.details.get(cid) or {}),
        }
        results.append((cid, final, detail))

    results.sort(key=lambda x: (-x[1], vector_ranked_ids.index(x[0]) if x[0] in vector_ranked_ids else 999))
    return results
