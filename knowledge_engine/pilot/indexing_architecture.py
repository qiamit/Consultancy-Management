"""
Incremental pilot indexing architecture (design + move/rename resilience).

Idempotent per-document manifest keyed by content SHA-256 document_id.
Does not touch protected collections.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from knowledge_engine.pilot.constants import (
    CHUNK_ID_SCHEME_V2,
    CHUNK_VERSION,
    EXTRACTION_VERSION,
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_BACKEND,
    PILOT_EMBEDDING_MODEL,
    QUALITY_GATE_VERSION,
    SECOND_PILOT_COLLECTION_NAME,
)

DocStatus = Literal[
    "pending",
    "processing",
    "indexed",
    "needs_review",
    "failed",
    "stale_source",
    "missing",
    "superseded",
]


@dataclass
class PilotDocumentRecord:
    document_id: str  # sha256:{content_digest}
    sha256: str
    source_relative_path: str  # mutable metadata
    extraction_version: str = EXTRACTION_VERSION
    chunk_version: str = CHUNK_VERSION
    chunk_id_scheme: str = CHUNK_ID_SCHEME_V2
    quality_gate_version: str = QUALITY_GATE_VERSION
    embedding_model: str = PILOT_EMBEDDING_MODEL
    embedding_backend: str = PILOT_EMBEDDING_BACKEND
    collection_name: str = SECOND_PILOT_COLLECTION_NAME
    status: DocStatus = "pending"
    indexed_at: str | None = None
    usable_chunk_count: int = 0
    needs_review_chunk_count: int = 0
    page_count: int | None = None
    error: str | None = None
    # Reliable metadata only — never invent
    is_number: str | None = None
    year: int | None = None
    title: str | None = None
    document_type: str | None = None  # inferred weakly from path when needed
    path_history: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


ARCHITECTURE_NOTES = f"""
Pilot indexing rules (second pilot)
-----------------------------------
1. Collection: {SECOND_PILOT_COLLECTION_NAME} (new path under sample_collections/).
2. Never delete/overwrite protected:
   - bis_two_sample_usable_v1
   - bis_two_sample_usable_multilingual_exp_v1
   - {PILOT_COLLECTION_NAME}
3. Manifest keyed by document_id = sha256:{{content_digest}}.
   source_relative_path / filename are mutable metadata.
4. Unchanged content hash → skip extraction/OCR/embed (reuse artifacts).
5. Same hash + different path/filename → metadata update only; no duplicate chunks.
6. Changed hash → re-extract / re-chunk / re-embed only that document.
7. Missing path + no matching hash → status stale_source/missing;
   do NOT immediately delete vectors (OneDrive may be unhydrated / move in progress).
8. Chunk IDs (v2+): doc_{{content_sha256[:12]}}:pXXXX:cYYY (path-independent).
   v1 pilot used path-hash labels for non-baseline; leave v1 untouched.
   Migration into v2: reuse cached chunk texts/embeddings by sha256; optionally
   remint chunk IDs under content scheme when writing the NEW collection only.
9. Metadata priority: content > filename > folder inference (never invent).
10. Embedding: FastEmbed paraphrase-multilingual-MiniLM-L12-v2 (no new model).
11. After second-pilot index: re-run reliability_eval_v1 + larger gold +
    All-Standards intrusion metrics (measure, do not arbitrary retune).
"""
