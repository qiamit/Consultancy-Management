"""Pilot collection naming and version constants.

Validated / protected collections must never be deleted/overwritten:
- bis_two_sample_usable_v1
- bis_two_sample_usable_multilingual_exp_v1
- bis_pilot_representative_v1  (authoritative first pilot — 1156 usable chunks)
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Authoritative first pilot (current runtime — do not overwrite)
# ---------------------------------------------------------------------------
PILOT_COLLECTION_NAME = "bis_pilot_representative_v1"
PILOT_SELECTION_ID = "pilot_selection_v1"
PILOT_SELECTION_SEED = "bis_pilot_v1_repr_20261007"

# ---------------------------------------------------------------------------
# Proposed second pilot (selection / architecture only until approved)
# ---------------------------------------------------------------------------
SECOND_PILOT_COLLECTION_NAME = "bis_pilot_representative_v2"
SECOND_PILOT_SELECTION_ID = "pilot_selection_v2"
SECOND_PILOT_SELECTION_SEED = "bis_pilot_v2_repr_20261007"
SECOND_PILOT_TARGET_TOTAL = 150
SECOND_PILOT_EXISTING_KEEP = 40
SECOND_PILOT_ADDITIONS_TARGET = 110

# Embedding — same validated FastEmbed ONNX model (no new download/install).
PILOT_EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
PILOT_EMBEDDING_BACKEND = "fastembed_onnx"

EXTRACTION_VERSION = "hybrid_extract_v1"
CHUNK_VERSION = "clause_chunk_v1"
# Path-independent chunk IDs for v2+ (document_id + page + ordinal).
CHUNK_ID_SCHEME_V2 = "document_id_page_ordinal_v1"
QUALITY_GATE_VERSION = "usable_needs_review_v1"

PROTECTED_COLLECTIONS = frozenset(
    {
        "bis_two_sample_usable_v1",
        "bis_two_sample_usable_multilingual_exp_v1",
        "bis_pilot_representative_v1",
    }
)

# Always include validated two-sample sources in the pilot for regression continuity.
BASELINE_MUST_INCLUDE = (
    "STD 9666/IS 9666 2023 - 00.pdf",
    "STD 21/Test Method/IS 2676 1981 - 00.pdf",
)

TARGET_PILOT_MIN = 20
TARGET_PILOT_MAX = 50
TARGET_PILOT_DEFAULT = 40
