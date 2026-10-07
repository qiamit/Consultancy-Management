"""
Small local vector search over usable chunks only (no bulk indexing).

Uses ChromaDB + its default local embedding function when available;
falls back to a deterministic local TF-IDF n-gram model (numpy).
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


COLLECTION_NAME = "bis_two_sample_usable_v1"
DEFAULT_DIAG_RUN = (
    "quality_fix_20261006T144338Z"
)


@dataclass
class UsableChunk:
    chunk_id: str
    text: str
    source_relative_path: str
    source_file_hash: str
    pdf_pages: list[int]
    clause_number: str | None
    extraction_method: str
    review_status: str
    text_quality_status: str
    visual_verification_status: str
    sample_label: str
    text_sha256: str
    text_version: int


def load_usable_chunks(chunks_dir: Path) -> list[UsableChunk]:
    """Load only review_status == usable from diagnostics chunk JSON files."""
    out: list[UsableChunk] = []
    for path in sorted(chunks_dir.glob("*__chunks.json")):
        if path.name == "chunks_overview.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        label = data.get("sample_label") or path.name.split("__")[0]
        for raw in data.get("chunks") or []:
            if raw.get("review_status") != "usable":
                continue
            out.append(
                UsableChunk(
                    chunk_id=raw["chunk_id"],
                    text=raw["text"],
                    source_relative_path=raw["source_relative_path"],
                    source_file_hash=raw["source_file_hash"],
                    pdf_pages=list(raw["pdf_pages"]),
                    clause_number=raw.get("clause_number"),
                    extraction_method=raw.get("extraction_method") or "native",
                    review_status=raw["review_status"],
                    text_quality_status=raw.get("text_quality_status") or "pass",
                    visual_verification_status=raw.get("visual_verification_status")
                    or "pending",
                    sample_label=label,
                    text_sha256=raw.get("text_sha256") or "",
                    text_version=int(raw.get("text_version") or 1),
                )
            )
    # Stable order; de-dupe by chunk_id (last wins only if identical id)
    by_id: dict[str, UsableChunk] = {}
    for c in out:
        by_id[c.chunk_id] = c
    return list(by_id.values())


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*|[अ-हॐक़-य़]+", text.lower())


def _char_ngrams(text: str, n: int = 3) -> list[str]:
    s = re.sub(r"\s+", " ", (text or "").lower()).strip()
    if len(s) < n:
        return [s] if s else []
    return [s[i : i + n] for i in range(len(s) - n + 1)]


class LocalTfidfIndex:
    """Tiny local vector model: word + char-3gram TF-IDF, cosine search."""

    model_name = "local-tfidf-word+char3gram-v1"

    def __init__(self) -> None:
        self.df: Counter[str] = Counter()
        self.n_docs = 0
        self.doc_vectors: dict[str, dict[str, float]] = {}
        self.meta: dict[str, dict[str, Any]] = {}

    def _features(self, text: str) -> Counter[str]:
        feats: Counter[str] = Counter()
        for tok in _tokenize(text):
            feats[f"w:{tok}"] += 1
        for ng in _char_ngrams(text, 3):
            feats[f"c:{ng}"] += 1
        return feats

    def upsert(self, chunk_id: str, text: str, metadata: dict[str, Any]) -> None:
        # Replace existing vector for same id (no duplicates).
        if chunk_id in self.doc_vectors:
            old = self.doc_vectors.pop(chunk_id)
            for term in old:
                self.df[term] = max(0, self.df[term] - 1)
            self.n_docs = max(0, self.n_docs - 1)
            self.meta.pop(chunk_id, None)

        feats = self._features(text)
        for term in feats:
            self.df[term] += 1
        self.n_docs += 1
        self.doc_vectors[chunk_id] = dict(feats)
        self.meta[chunk_id] = metadata

    def _tfidf(self, feats: dict[str, float]) -> dict[str, float]:
        vec: dict[str, float] = {}
        for term, tf in feats.items():
            idf = math.log((1 + self.n_docs) / (1 + self.df.get(term, 0))) + 1.0
            vec[term] = (1.0 + math.log(tf)) * idf
        return vec

    @staticmethod
    def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
        if not a or not b:
            return 0.0
        keys = set(a) & set(b)
        num = sum(a[k] * b[k] for k in keys)
        na = math.sqrt(sum(v * v for v in a.values()))
        nb = math.sqrt(sum(v * v for v in b.values()))
        if na == 0 or nb == 0:
            return 0.0
        return num / (na * nb)

    def query(self, text: str, *, n_results: int = 3) -> list[dict[str, Any]]:
        q = self._tfidf(self._features(text))
        scored: list[tuple[float, str]] = []
        for cid, feats in self.doc_vectors.items():
            score = self._cosine(q, self._tfidf(feats))
            scored.append((score, cid))
        scored.sort(reverse=True)
        results = []
        for score, cid in scored[:n_results]:
            m = self.meta[cid]
            results.append(
                {
                    "chunk_id": cid,
                    "score": round(float(score), 6),
                    "text": m.get("text", ""),
                    "clause_number": m.get("clause_number"),
                    "pdf_pages": m.get("pdf_pages"),
                    "source_relative_path": m.get("source_relative_path"),
                    "sample_label": m.get("sample_label"),
                    "review_status": m.get("review_status"),
                }
            )
        return results

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model_name": self.model_name,
            "n_docs": self.n_docs,
            "df": dict(self.df),
            "doc_vectors": self.doc_vectors,
            "meta": self.meta,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "LocalTfidfIndex":
        data = json.loads(path.read_text(encoding="utf-8"))
        idx = cls()
        idx.n_docs = int(data["n_docs"])
        idx.df = Counter(data["df"])
        idx.doc_vectors = {k: dict(v) for k, v in data["doc_vectors"].items()}
        idx.meta = data["meta"]
        return idx


def is_number_from_source_path(relative_path: str) -> str | None:
    """Derive display IS number from source-relative path (no filesystem leak)."""
    m = re.search(r"IS\s*(\d+)\s+(\d{4})", relative_path or "", re.I)
    if m:
        return f"IS {m.group(1)} : {m.group(2)}"
    m = re.search(r"IS\s*(\d+)", relative_path or "", re.I)
    if m:
        return f"IS {m.group(1)}"
    return None


def default_chroma_persist_dir(vector_db_path: Path) -> Path:
    return (
        vector_db_path
        / "sample_collections"
        / COLLECTION_NAME
        / "chroma"
    )


def open_existing_chroma_collection(
    *,
    persist_dir: Path,
    collection_name: str = COLLECTION_NAME,
) -> tuple[str, Any]:
    """
    Open an already-built collection. Does NOT delete, upsert, or re-embed.
    """
    import chromadb
    from chromadb.utils import embedding_functions

    if not persist_dir.is_dir():
        raise FileNotFoundError(f"Chroma persist dir missing: {persist_dir}")

    client = chromadb.PersistentClient(path=str(persist_dir))
    names = client.list_collections()
    # Chroma 0.6 returns name strings; older returns objects.
    name_list = [
        n if isinstance(n, str) else getattr(n, "name", str(n)) for n in names
    ]
    if collection_name not in name_list:
        raise RuntimeError(
            f"Collection {collection_name!r} not found in {persist_dir}. "
            f"Available: {name_list}"
        )

    ef = embedding_functions.DefaultEmbeddingFunction()
    model_name = "chromadb-default-onnx-minilm"
    collection = client.get_collection(
        name=collection_name, embedding_function=ef
    )
    return model_name, collection


def try_chromadb_index(
    *,
    persist_dir: Path,
    chunks: list[UsableChunk],
) -> tuple[str, Any] | None:
    """Build/get Chroma collection; return (model_name, collection) or None."""
    try:
        import chromadb
        from chromadb.utils import embedding_functions
    except ImportError:
        return None

    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))

    # Default ONNX MiniLM — local after first download.
    ef = embedding_functions.DefaultEmbeddingFunction()
    model_name = "chromadb-default-onnx-minilm"

    # Drop and recreate to avoid stale duplicates across test runs,
    # but upsert by chunk_id so re-runs stay idempotent within a session.
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:  # noqa: BLE001
        pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
        metadata={"purpose": "two_sample_usable_vector_search_test"},
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
            }
        )

    # Upsert by stable chunk_id → no duplicates.
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return model_name, collection


def query_chromadb(collection: Any, query: str, *, n_results: int = 3) -> list[dict[str, Any]]:
    raw = collection.query(query_texts=[query], n_results=n_results)
    results: list[dict[str, Any]] = []
    ids = (raw.get("ids") or [[]])[0]
    docs = (raw.get("documents") or [[]])[0]
    metas = (raw.get("metadatas") or [[]])[0]
    dists = (raw.get("distances") or [[]])[0]
    for i, cid in enumerate(ids):
        meta = metas[i] or {}
        pages = meta.get("pdf_pages")
        if isinstance(pages, str):
            try:
                pages = json.loads(pages)
            except json.JSONDecodeError:
                pages = [pages]
        dist = dists[i] if i < len(dists) else None
        score = None if dist is None else round(1.0 / (1.0 + float(dist)), 6)
        results.append(
            {
                "chunk_id": cid,
                "score": score,
                "distance": dist,
                "text": docs[i],
                "clause_number": meta.get("clause_number") or None,
                "pdf_pages": pages,
                "source_relative_path": meta.get("source_relative_path"),
                "sample_label": meta.get("sample_label"),
                "review_status": meta.get("review_status"),
            }
        )
    return results


def build_local_tfidf_index(chunks: list[UsableChunk], store_path: Path) -> LocalTfidfIndex:
    idx = LocalTfidfIndex()
    for c in chunks:
        idx.upsert(
            c.chunk_id,
            c.text,
            {
                "text": c.text,
                "clause_number": c.clause_number,
                "pdf_pages": c.pdf_pages,
                "source_relative_path": c.source_relative_path,
                "sample_label": c.sample_label,
                "review_status": c.review_status,
                "source_file_hash": c.source_file_hash,
                "text_sha256": c.text_sha256,
                "text_version": c.text_version,
            },
        )
    idx.save(store_path)
    return idx


def assert_no_forbidden_hits(results: list[dict[str, Any]], *, forbidden_pages: dict[str, set[int]]) -> list[str]:
    """Return violation messages if needs-review pages leak into results."""
    violations: list[str] = []
    for r in results:
        if r.get("review_status") and r["review_status"] != "usable":
            violations.append(f"non_usable_status:{r['chunk_id']}:{r['review_status']}")
        label = r.get("sample_label") or ""
        pages = set(r.get("pdf_pages") or [])
        bad = forbidden_pages.get(label, set()) & pages
        if bad:
            violations.append(f"forbidden_page:{r['chunk_id']}:pages={sorted(bad)}")
    return violations
