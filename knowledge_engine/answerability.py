"""
Multi-signal answerability / rejection for controlled BIS retrieval.

Does not treat nearest-neighbor alone as a verified answer.
Outputs one of: supported | uncertain | not_found.

Key idea: domain-generic overlap (e.g. "blank granules", "aluminium sheet")
is not enough — distinctive intent anchors from the query must also appear
in the retrieved evidence (directly or via bilingual expansion hits).
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from knowledge_engine.hybrid_retrieval import (
    expand_query_terms,
    extract_clause_mentions,
)

AnswerabilityState = Literal["supported", "uncertain", "not_found"]

MSG_SUPPORTED_HI = "जाँचा हुआ संबंधित स्रोत मिला।"
MSG_UNCERTAIN_HI = "संभावित संबंधित अंश मिला है, लेकिन सत्यापन आवश्यक है।"
MSG_NOT_FOUND_HI = "जाँचे हुए स्रोत में इस प्रश्न का पर्याप्त प्रमाण नहीं मिला।"

_STOP = {
    "the", "a", "an", "of", "and", "or", "in", "on", "for", "to", "is", "are",
    "was", "be", "this", "that", "with", "from", "by", "as", "at", "it", "its",
    "shall", "may", "can", "what", "which", "how", "should", "must", "does",
    "do", "did", "will", "would", "about", "into", "than", "then", "also",
    "क्या", "के", "में", "का", "की", "है", "और", "से", "को", "पर", "हैं",
    "होना", "चाहिए", "कितनी", "कहाँ", "बारे", "आवश्यकता", "या", "बैग",
    "without", "must", "granular", "matter",
}

# Overlap with these alone never proves the answer is in the chunk.
_DOMAIN_GENERIC = {
    "blank", "granule", "granules", "material", "materials", "standard",
    "indian", "requirement", "requirements", "according", "specification",
    "aluminium", "aluminum", "alloy", "alloys", "sheet", "strip", "wrought",
    "bis", "licence", "license", "container", "sample", "test", "method",
    "methods", "value", "values", "number", "given", "type", "purpose",
    "following", "definitions", "apply", "laid", "down", "first", "revision",
    "published", "used", "conjunction", "detailed", "recommended",
    "ब्लैंक", "ग्रेन्यूल", "ग्रेन्यूल्स", "कणिका", "कणिकाओं", "पदार्थ",
    "एल्युमिनियम", "शीट", "स्ट्रिप",
}

# Multi-word technical phrases that DO count as strong evidence when present.
_STRONG_PHRASES = [
    "extraneous material",
    "liquid holding capacity",
    "maximum loading",
    "technical formulation",
    "percent by mass",
    "polypropylene",
    "high-density polyethylene",
    "dimensions and tolerances",
    "batch no",
    "net mass",
    "heavy aromatic naphtha",
    "cyclohexanone",
    "shake the bottle",
    "first published in 1964",
    "bs 1470",
    "is : 737",
    "is 737",
    "rounded off",
    "24 april 1981",
    "squareness tolerance",
    "binder",
    "stabilizer",
    "activator",
    "deactivator",
]

# Distinctive intent lemmas that, if present in the query, must be evidenced
# (or covered by a strong phrase / expansion) for supported.
_INTENT_HINT = re.compile(
    r"\b("
    r"melting|moisture|density|particle|sieve|shelf|colour|color|"
    r"tensile|strength|chemical|composition|fee|marking\s+fee|"
    r"sampling\s+plan|acceptance|lot\s+size|ph|temperature|storage|"
    r"hardness|brinell|coating|thickness\s+table|नमी|मोटाई|"
    r"extraneous|formula|calculation| सूत्र|फॉर्मूला|lhc|"
    r"loading|principle|packing|marking|burette|tolerances?|dimensions?|"
    r"binder|stabilizer|activator|deactivator|polypropylene|hdpe|"
    r"naphtha|cyclohexanone|1964|1470|737|rounding|squareness|"
    r"pesticidal|fertilizers?|bio\s*stimulants?"
    r")\b",
    re.I,
)


@dataclass
class SignalBundle:
    vector_similarity: float = 0.0
    lexical_raw: float = 0.0
    lexical_norm: float = 0.0
    hybrid_rank: int | None = None
    hybrid_score: float = 0.0
    top1_top2_gap: float = 0.0
    exact_phrase_match: bool = False
    technical_phrase_hits: int = 0
    strong_phrase_hits: int = 0
    clause_query_match: bool = False
    clause_mismatch: bool = False
    standard_filter_ok: bool = True
    evidence_coverage: float = 0.0
    intent_coverage: float = 0.0
    intent_hits: int = 0
    intent_total: int = 0
    content_term_hits: int = 0
    content_term_total: int = 0
    missing_intent_terms: list[str] = field(default_factory=list)


@dataclass
class AnswerabilityResult:
    state: AnswerabilityState
    message_hi: str
    reasons: list[str] = field(default_factory=list)
    signals: dict[str, Any] = field(default_factory=dict)
    debug_scores: dict[str, Any] = field(default_factory=dict)

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "answerability_state": self.state,
            "message_hi": self.message_hi,
            "evidence_reasons": self.reasons,
            "signals_summary": {
                "exact_phrase_match": self.signals.get("exact_phrase_match"),
                "strong_phrase_hits": self.signals.get("strong_phrase_hits"),
                "clause_query_match": self.signals.get("clause_query_match"),
                "evidence_coverage": self.signals.get("evidence_coverage"),
                "intent_coverage": self.signals.get("intent_coverage"),
                "hybrid_rank": self.signals.get("hybrid_rank"),
                "top1_top2_gap": self.signals.get("top1_top2_gap"),
                "missing_intent_terms": self.signals.get("missing_intent_terms"),
                "standard_filter_ok": self.signals.get("standard_filter_ok"),
            },
            "debug_scores": self.debug_scores,
        }


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _query_tokens(query: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*|[\u0900-\u097F]+", query or "")


def _intent_anchors(query: str) -> list[str]:
    """Distinctive terms the retrieved text must support."""
    q = query or ""
    anchors: list[str] = []
    for m in _INTENT_HINT.finditer(q):
        anchors.append(m.group(1).lower())
    # Also take non-generic original tokens longer than 3
    for tok in _query_tokens(q):
        t = tok.lower()
        if t in _STOP or t in _DOMAIN_GENERIC or len(t) < 4:
            continue
        if t not in anchors:
            anchors.append(t)
    # de-dupe
    seen: set[str] = set()
    out: list[str] = []
    for a in anchors:
        if a not in seen:
            seen.add(a)
            out.append(a)
    return out


def _strong_phrase_hits(query: str, text: str) -> list[str]:
    qn = _norm(query)
    has_deva = bool(re.search(r"[\u0900-\u097F]", query or ""))
    hits: list[str] = []
    for ph in _STRONG_PHRASES:
        if ph not in text:
            continue
        if ph in qn:
            hits.append(ph)
            continue
        # Distinctive phrase tokens must appear in the original query (not only expansions)
        ph_words = [w for w in ph.split() if len(w) >= 4 and w not in _DOMAIN_GENERIC]
        if ph_words and any(w in qn for w in ph_words):
            hits.append(ph)
            continue
        # Hindi/mixed: allow expansion bridge (English corpus ← Hindi query)
        if has_deva and _expansion_supports_phrase(query, ph):
            hits.append(ph)
            continue
    # Original ASCII multi-word query substring
    if len(qn) >= 16 and re.search(r"[a-z]", qn) and qn in text:
        hits.append("full_query_substring")
    return hits


def _expansion_supports_phrase(query: str, phrase: str) -> bool:
    """True if bilingual/local expansions bridge Hindi/mixed → English phrase."""
    expanded = " ".join(expand_query_terms(query))
    return phrase in expanded or all(
        w in expanded for w in phrase.split() if len(w) >= 4
    )


def compute_signals(
    *,
    query: str,
    ranked_hits: list[dict[str, Any]],
    selected_standard: str = "all",
) -> SignalBundle:
    sig = SignalBundle()
    if not ranked_hits:
        return sig

    top = ranked_hits[0]
    text = _norm(top.get("text") or "")
    clause = (top.get("clause_number") or "").strip()
    is_no = (top.get("is_number") or "").strip()
    sample = (top.get("sample_label") or "").strip()

    sig.hybrid_rank = 1
    sig.vector_similarity = float(top.get("vector_similarity") or 0.0)
    sig.lexical_raw = float(top.get("lexical_raw") or 0.0)
    sig.lexical_norm = float(top.get("lexical_norm") or 0.0)
    sig.hybrid_score = float(top.get("hybrid_score") or top.get("final_score") or 0.0)

    if len(ranked_hits) >= 2:
        s1 = float(ranked_hits[0].get("hybrid_score") or ranked_hits[0].get("final_score") or 0.0)
        s2 = float(ranked_hits[1].get("hybrid_score") or ranked_hits[1].get("final_score") or 0.0)
        sig.top1_top2_gap = max(0.0, s1 - s2)

    strong = _strong_phrase_hits(query, text)
    sig.strong_phrase_hits = len(strong)
    sig.technical_phrase_hits = len(strong)
    sig.exact_phrase_match = len(strong) >= 1

    mentions = extract_clause_mentions(query)
    if mentions and clause:
        mnorm = [m.replace(" ", "").upper() for m in mentions]
        cnorm = clause.replace(" ", "").upper()
        if cnorm in mnorm:
            sig.clause_query_match = True
        else:
            sig.clause_mismatch = True
    elif mentions and not clause:
        sig.clause_mismatch = True

    std = (selected_standard or "all").strip()
    if std == "IS 9666":
        sig.standard_filter_ok = sample == "native_text" or "9666" in is_no
    elif std == "IS 2676":
        sig.standard_filter_ok = sample == "scanned" or "2676" in is_no
    else:
        sig.standard_filter_ok = True

    # Generic content coverage (includes domain words) — diagnostic only
    expanded = expand_query_terms(query)
    content = [
        t for t in expanded
        if t not in _STOP and (len(t) >= 4 or " " in t)
    ]
    hit_n = sum(1 for t in content if t in text)
    sig.content_term_total = len(content)
    sig.content_term_hits = hit_n
    sig.evidence_coverage = (hit_n / len(content)) if content else 0.0

    # Intent anchors: must be supported by text OR by strong phrase bridge
    anchors = _intent_anchors(query)
    missing: list[str] = []
    intent_hit = 0
    for a in anchors:
        # synonym / expansion bridge
        bridged = False
        if a in text:
            bridged = True
        elif a in ("सूत्र", "फॉर्मूला", "formula", "calculation", "lhc") and (
            "liquid holding capacity" in text or "percent by mass" in text or "m / (m1 + m)" in text
        ):
            bridged = True
        elif a in ("लोडिंग", "loading", "principle", "प्रिंसिपल", "सिद्धांत") and (
            "maximum loading" in text and "technical formulation" in text
        ):
            bridged = True
        elif a in ("extraneous", "बाहरी") and "extraneous material" in text:
            bridged = True
        elif a in ("dimensions", "tolerances", "आयाम", "टॉलरेंस") and (
            "dimensions and tolerances" in text or "dimensions" in text
        ):
            bridged = True
        elif a in ("packing", "पैकिंग", "polypropylene", "hdpe") and (
            "polypropylene" in text or "hdpe" in text or "packing" in text
        ):
            bridged = True
        elif a in ("marking", "चिह्न") and ("batch no" in text or "net mass" in text):
            bridged = True
        elif a in ("binder", "stabilizer", "activator", "deactivator", "बाइंडर", "स्टेबलाइजर"):
            if any(x in text for x in ("binder", "stabilizer", "activator", "deactivator")):
                bridged = True
        elif a in ("1964",) and "1964" in text:
            bridged = True
        elif a in ("1470",) and "1470" in text:
            bridged = True
        elif a in ("737",) and "737" in text:
            bridged = True
        elif a in ("rounding",) and "rounded off" in text:
            bridged = True
        elif a in ("squareness",) and "squareness" in text:
            bridged = True
        elif a in ("burette", "naphtha", "cyclohexanone") and a in text:
            bridged = True
        elif a in ("pesticidal", "fertilizers", "fertilizer") and (
            "pesticidal" in text or "fertilizer" in text
        ):
            bridged = True
        elif a in ("लिक्विड", "होल्डिंग", "कैपेसिटी", "एलएचसी") and (
            "liquid holding capacity" in text or "lhc" in text
        ):
            bridged = True
        elif a in ("पॉलीप्रोपाइलीन", "एचडीपीई") and (
            "polypropylene" in text or "hdpe" in text or "high-density polyethylene" in text
        ):
            bridged = True
        elif a in ("foreign",) and "extraneous" in text:
            bridged = True
        elif a in ("determination",) and (
            "determination of liquid holding capacity" in text
            or "liquid holding capacity" in text
        ):
            bridged = True

        if bridged:
            intent_hit += 1
        else:
            missing.append(a)

    sig.intent_total = len(anchors)
    sig.intent_hits = intent_hit
    sig.intent_coverage = (intent_hit / len(anchors)) if anchors else 0.0
    sig.missing_intent_terms = missing
    return sig


def decide_answerability(sig: SignalBundle) -> AnswerabilityResult:
    reasons: list[str] = []
    debug = {
        "vector_similarity": round(sig.vector_similarity, 4),
        "lexical_raw": round(sig.lexical_raw, 4),
        "lexical_norm": round(sig.lexical_norm, 4),
        "hybrid_score": round(sig.hybrid_score, 6),
        "top1_top2_gap": round(sig.top1_top2_gap, 6),
        "evidence_coverage": round(sig.evidence_coverage, 4),
        "intent_coverage": round(sig.intent_coverage, 4),
        "strong_phrase_hits": sig.strong_phrase_hits,
        "intent_hits": sig.intent_hits,
        "intent_total": sig.intent_total,
        "missing_intent_terms": list(sig.missing_intent_terms),
    }
    signals = asdict(sig)

    if not sig.standard_filter_ok:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["standard_filter_mismatch"],
            signals=signals,
            debug_scores=debug,
        )

    if sig.hybrid_rank is None and sig.hybrid_score == 0 and sig.vector_similarity == 0:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["no_candidates"],
            signals=signals,
            debug_scores=debug,
        )

    strong_phrase = sig.exact_phrase_match and sig.strong_phrase_hits >= 1
    intent_ok = sig.intent_coverage >= 0.6 and sig.intent_hits >= 1
    intent_partial = sig.intent_coverage >= 0.34 and sig.intent_hits >= 1
    intent_missing = sig.intent_total > 0 and sig.intent_coverage < 0.34
    clause_ok = sig.clause_query_match
    separated = sig.top1_top2_gap >= 0.0008
    vector_ok = sig.vector_similarity >= 0.42
    lex_ok = sig.lexical_raw >= 4.0

    # --- Hard not_found: distinctive intent not evidenced ---
    # Strong technical phrase in both query-side and chunk can bridge bilingual gaps.
    if intent_missing and not clause_ok and not strong_phrase:
        reasons.append("intent_anchors_not_in_evidence")
        if sig.missing_intent_terms:
            reasons.append("missing:" + ",".join(sig.missing_intent_terms[:6]))
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=reasons,
            signals=signals,
            debug_scores=debug,
        )

    # Domain-generic-only: no strong phrase, weak intent, no clause
    if not strong_phrase and not intent_ok and not clause_ok and sig.intent_total >= 2:
        if sig.intent_coverage < 0.5:
            return AnswerabilityResult(
                state="not_found",
                message_hi=MSG_NOT_FOUND_HI,
                reasons=["domain_overlap_without_intent_support"],
                signals=signals,
                debug_scores=debug,
            )

    if sig.clause_mismatch and not strong_phrase and not intent_ok:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["clause_mismatch_without_supporting_evidence"],
            signals=signals,
            debug_scores=debug,
        )

    # --- supported ---
    support_votes = 0
    support_reasons: list[str] = []
    if strong_phrase:
        support_votes += 2
        support_reasons.append("exact_technical_phrase_match")
    if intent_ok:
        support_votes += 2
        support_reasons.append("intent_anchors_covered")
    elif intent_partial:
        support_votes += 1
        support_reasons.append("partial_intent_coverage")
    if clause_ok:
        support_votes += 2
        support_reasons.append("clause_id_match")
    if vector_ok:
        support_votes += 1
        support_reasons.append("adequate_vector_similarity")
    if lex_ok:
        support_votes += 1
        support_reasons.append("adequate_lexical_overlap")
    if separated:
        support_votes += 1
        support_reasons.append("top1_separated_from_top2")

    # Must evidence the question's intent — never vector/domain overlap alone.
    # Strong phrase helps, but fee/melting-style queries still need intent coverage.
    core_ok = intent_ok or clause_ok or (strong_phrase and intent_partial)
    if core_ok and support_votes >= 4:
        return AnswerabilityResult(
            state="supported",
            message_hi=MSG_SUPPORTED_HI,
            reasons=support_reasons,
            signals=signals,
            debug_scores=debug,
        )

    if (intent_ok or clause_ok) and support_votes >= 3:
        return AnswerabilityResult(
            state="supported",
            message_hi=MSG_SUPPORTED_HI,
            reasons=support_reasons,
            signals=signals,
            debug_scores=debug,
        )

    if strong_phrase and intent_ok and support_votes >= 3:
        return AnswerabilityResult(
            state="supported",
            message_hi=MSG_SUPPORTED_HI,
            reasons=support_reasons,
            signals=signals,
            debug_scores=debug,
        )

    # --- uncertain ---
    if core_ok or intent_partial:
        return AnswerabilityResult(
            state="uncertain",
            message_hi=MSG_UNCERTAIN_HI,
            reasons=(support_reasons or ["partial_signal_match"]) + ["needs_human_verification"],
            signals=signals,
            debug_scores=debug,
        )

    return AnswerabilityResult(
        state="not_found",
        message_hi=MSG_NOT_FOUND_HI,
        reasons=reasons or ["insufficient_multi_signal_evidence"],
        signals=signals,
        debug_scores=debug,
    )


def evaluate_answerability(
    *,
    query: str,
    ranked_hits: list[dict[str, Any]],
    selected_standard: str = "all",
) -> AnswerabilityResult:
    if not ranked_hits:
        return AnswerabilityResult(
            state="not_found",
            message_hi=MSG_NOT_FOUND_HI,
            reasons=["no_candidates"],
            signals={},
            debug_scores={},
        )
    sig = compute_signals(
        query=query,
        ranked_hits=ranked_hits,
        selected_standard=selected_standard,
    )
    return decide_answerability(sig)
