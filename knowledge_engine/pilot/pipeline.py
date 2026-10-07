"""
Resumable pilot indexing pipeline for approved selection only.

Never touches protected collections. Source PDFs are read-only.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any

from knowledge_engine.chunk_extract import (
    Chunk,
    build_chunks_from_summary,
    sha256_file,
    write_chunks_bundle,
)
from knowledge_engine.extract_pdf import extract_pdf_hybrid, write_extraction_diagnostics
from knowledge_engine.pilot.constants import (
    BASELINE_MUST_INCLUDE,
    CHUNK_VERSION,
    EXTRACTION_VERSION,
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_MODEL,
    PROTECTED_COLLECTIONS,
)
from knowledge_engine.pilot.manifest import (
    load_manifest,
    mark_stale_processing,
    new_doc_record,
    save_manifest,
    should_skip_unchanged,
    utc_now,
)
from knowledge_engine.pilot.quality_gate import (
    apply_pilot_quality_gate,
    chunk_to_metadata,
    filter_usable_for_index,
)

VALIDATED_CHUNKS_RUN = "quality_fix_20261006T144338Z"

BASELINE_LABELS = {
    "STD 9666/IS 9666 2023 - 00.pdf": "native_text",
    "STD 21/Test Method/IS 2676 1981 - 00.pdf": "scanned",
}


def prefer_project_tesseract() -> None:
    conda_tess = Path(__file__).resolve().parents[1] / ".conda" / "bin" / "tesseract"
    if conda_tess.is_file():
        os.environ["PATH"] = f"{conda_tess.parent}{os.pathsep}{os.environ.get('PATH', '')}"


def folder_context(rel: str) -> str:
    parts = Path(rel).parts
    low = [p.lower() for p in parts]
    if any(p in ("test method", "test methods") for p in low):
        return "test_method"
    if any("master document" in p for p in low):
        return "master_documents"
    return "standard_root"


def sample_label_for(rel: str) -> str:
    """v1 path-based label (used by bis_pilot_representative_v1).

    Second pilot (v2) should prefer document_identity.sample_label_for_content(sha256)
    so chunk IDs survive OneDrive path/filename moves. Do not rewrite protected v1.
    """
    if rel in BASELINE_LABELS:
        return BASELINE_LABELS[rel]
    digest = hashlib.sha256(rel.encode("utf-8")).hexdigest()[:12]
    return f"doc_{digest}"


def pilot_paths(vector_db_path: Path) -> dict[str, Path]:
    root = vector_db_path / "sample_collections" / PILOT_COLLECTION_NAME
    return {
        "root": root,
        "chroma": root / "chroma",
        "manifest": root / "manifest.json",
        "diagnostics": root / "diagnostics",
        "chunks": root / "chunks",
        "needs_review": root / "needs_review_chunks",
        "metrics": root / "metrics.json",
    }


def assert_not_protected_path(path: Path) -> None:
    s = str(path)
    for name in PROTECTED_COLLECTIONS:
        # allow reading sibling folders; forbid writing into protected collection dirs
        if f"/sample_collections/{name}/" in s.replace("\\", "/") or s.endswith(
            f"/sample_collections/{name}"
        ):
            if PILOT_COLLECTION_NAME not in s:
                raise RuntimeError(f"Refusing to write protected collection path: {path}")


def open_or_create_pilot_collection(persist_dir: Path) -> tuple[str, Any]:
    import chromadb
    from knowledge_engine.scripts.compare_multilingual_ranking import FastEmbedMultilingualEF

    assert_not_protected_path(persist_dir)
    if PILOT_COLLECTION_NAME in PROTECTED_COLLECTIONS:
        raise RuntimeError("Pilot collection name collides with protected set")

    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))
    names = [
        n if isinstance(n, str) else getattr(n, "name", str(n))
        for n in client.list_collections()
    ]
    for bad in PROTECTED_COLLECTIONS:
        if bad in names:
            raise RuntimeError(
                f"Refusing to operate: protected collection {bad!r} found inside pilot chroma path"
            )

    ef = FastEmbedMultilingualEF(PILOT_EMBEDDING_MODEL)
    col = client.get_or_create_collection(
        name=PILOT_COLLECTION_NAME,
        embedding_function=ef,
        metadata={
            "purpose": "bis_representative_pilot_v1",
            "model": PILOT_EMBEDDING_MODEL,
            "backend": "fastembed-onnx",
            "extraction_version": EXTRACTION_VERSION,
            "chunk_version": CHUNK_VERSION,
        },
    )
    return f"fastembed:{PILOT_EMBEDDING_MODEL}", col


def _upsert_usable(collection: Any, chunks: list[Chunk], *, sample_label: str, document_type: str) -> list[str]:
    if not chunks:
        return []
    ids = [c.chunk_id for c in chunks]
    docs = [c.text for c in chunks]
    metas = [chunk_to_metadata(c, sample_label=sample_label, document_type=document_type) for c in chunks]
    # Chroma batch safety
    batch = 64
    for i in range(0, len(ids), batch):
        collection.upsert(
            ids=ids[i : i + batch],
            documents=docs[i : i + batch],
            metadatas=metas[i : i + batch],
        )
    return ids


def _delete_previous_ids(collection: Any, ids: list[str]) -> None:
    if not ids:
        return
    try:
        collection.delete(ids=ids)
    except Exception:  # noqa: BLE001
        pass


def load_validated_baseline_chunks(
    *,
    diagnostics_root: Path,
    rel: str,
    file_hash: str,
) -> list[Chunk] | None:
    label = BASELINE_LABELS.get(rel)
    if not label:
        return None
    path = diagnostics_root / VALIDATED_CHUNKS_RUN / "chunks" / f"{label}__chunks.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    stored_hash = data.get("source_file_hash_sha256") or ""
    if stored_hash and stored_hash != file_hash:
        return None  # source changed — do not reuse
    chunks: list[Chunk] = []
    for raw in data.get("chunks") or []:
        chunks.append(
            Chunk(
                chunk_id=raw["chunk_id"],
                source_relative_path=raw["source_relative_path"],
                source_file_hash=raw["source_file_hash"],
                pdf_pages=list(raw["pdf_pages"]),
                clause_number=raw.get("clause_number"),
                extraction_method=raw.get("extraction_method") or "native",
                review_status=raw["review_status"],
                text=raw["text"],
                char_count=int(raw.get("char_count") or len(raw.get("text") or "")),
                text_quality_status=raw.get("text_quality_status") or "pass",
                visual_verification_status=raw.get("visual_verification_status") or "verified",
                review_reasons=list(raw.get("review_reasons") or []),
                text_sha256=raw.get("text_sha256") or "",
                text_version=int(raw.get("text_version") or 1),
            )
        )
    # Preserve validated usable/needs_review as-is (already reviewed)
    return chunks


def process_one_pdf(
    *,
    rel: str,
    pdf_path: Path,
    collection: Any,
    paths: dict[str, Path],
    diagnostics_root: Path,
    ocr_dpi: int = 200,
) -> dict[str, Any]:
    t_all = time.perf_counter()
    file_hash = sha256_file(pdf_path)
    size = pdf_path.stat().st_size
    label = sample_label_for(rel)
    doc_type = folder_context(rel)
    timings: dict[str, float] = {}

    # Prefer validated baseline import when hash matches
    t0 = time.perf_counter()
    validated = load_validated_baseline_chunks(
        diagnostics_root=diagnostics_root, rel=rel, file_hash=file_hash
    )
    timings["validated_lookup"] = time.perf_counter() - t0

    native_pages = ocr_pages = blank_pages = 0
    page_count = None
    source_mode = "freshly_extracted"

    if validated is not None:
        source_mode = "validated_import"
        chunks = validated
        # Approximate page stats from chunk pages + known baselines
        page_count = max((max(c.pdf_pages) for c in chunks if c.pdf_pages), default=0) or None
        for c in chunks:
            if c.extraction_method.startswith("ocr"):
                ocr_pages += 1
            elif c.extraction_method.startswith("native"):
                native_pages += 1
    else:
        t0 = time.perf_counter()
        render_dir = paths["diagnostics"] / label / "ocr_renders"
        result = extract_pdf_hybrid(
            pdf_path,
            relative_path=rel,
            enable_ocr=True,
            render_dir=render_dir,
            ocr_dpi=ocr_dpi,
            ocr_lang="eng+hin",
        )
        timings["extract_ocr"] = time.perf_counter() - t0
        page_count = result.page_count
        native_pages = result.pages_native
        ocr_pages = result.pages_ocr
        blank_pages = result.pages_blank_skipped

        sample_diag = paths["diagnostics"] / label
        sample_diag.mkdir(parents=True, exist_ok=True)
        outputs = write_extraction_diagnostics(result, sample_diag)
        summary = json.loads(Path(outputs["summary_json"]).read_text(encoding="utf-8"))

        t0 = time.perf_counter()
        raw_chunks = build_chunks_from_summary(
            summary,
            source_file_hash=file_hash,
            sample_label=label,
        )
        chunks = apply_pilot_quality_gate(raw_chunks)
        timings["chunk_gate"] = time.perf_counter() - t0

    usable = filter_usable_for_index(chunks)
    needs_review = [c for c in chunks if c.review_status == "needs_review"]

    # Persist chunk diagnostics
    write_chunks_bundle(
        out_dir=paths["chunks"],
        sample_label=label,
        relative_path=rel,
        source_file_hash=file_hash,
        chunks=chunks,
        summary_stats={
            "page_count": page_count,
            "pages_native": native_pages,
            "pages_ocr": ocr_pages,
            "pages_blank_skipped": blank_pages,
            "usable": len(usable),
            "needs_review": len(needs_review),
            "source_mode": source_mode,
        },
    )
    if needs_review:
        write_chunks_bundle(
            out_dir=paths["needs_review"],
            sample_label=label,
            relative_path=rel,
            source_file_hash=file_hash,
            chunks=needs_review,
            summary_stats={"note": "needs_review_only"},
        )

    t0 = time.perf_counter()
    # Replace prior indexed ids for this document if re-processing
    # (caller may pass previous ids via record — handled in orchestrator)
    indexed_ids = _upsert_usable(
        collection, usable, sample_label=label, document_type=doc_type
    )
    timings["embed_upsert"] = time.perf_counter() - t0
    timings["total"] = time.perf_counter() - t_all

    status = "indexed" if usable else ("needs_review" if needs_review else "failed")
    if not usable and not needs_review and not chunks:
        status = "failed"

    return {
        "source_relative_path": rel,
        "sha256": file_hash,
        "file_size": size,
        "page_count": page_count,
        "status": status,
        "usable_chunk_count": len(usable),
        "needs_review_chunk_count": len(needs_review),
        "native_page_count": native_pages,
        "ocr_page_count": ocr_pages,
        "blank_skipped_page_count": blank_pages,
        "indexed_chunk_ids": indexed_ids,
        "source_mode": source_mode,
        "timings_sec": {k: round(v, 3) for k, v in timings.items()},
        "sample_label": label,
        "document_type": doc_type,
        "error": None if status != "failed" else "no_chunks_produced",
    }


def dir_size_bytes(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def run_pilot_indexing(
    *,
    selection_path: Path,
    pdf_source_dir: Path,
    vector_db_path: Path,
    diagnostics_root: Path,
    ocr_dpi: int = 200,
) -> dict[str, Any]:
    prefer_project_tesseract()
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    selected = selection.get("selected") or []
    if len(selected) < 1:
        raise RuntimeError("selection file has no selected PDFs")

    paths = pilot_paths(vector_db_path)
    for key in ("root", "chroma", "diagnostics", "chunks", "needs_review"):
        assert_not_protected_path(paths[key])
        paths[key].mkdir(parents=True, exist_ok=True)

    disk_before = dir_size_bytes(paths["root"])
    chroma_before = dir_size_bytes(paths["chroma"])

    model_label, collection = open_or_create_pilot_collection(paths["chroma"])
    manifest = load_manifest(paths["manifest"])
    recovered = mark_stale_processing(manifest)
    if recovered:
        save_manifest(paths["manifest"], manifest)

    wall0 = time.perf_counter()
    results: list[dict[str, Any]] = []

    for item in selected:
        rel = item["relative_path"]
        pdf_path = (pdf_source_dir / rel).resolve()
        try:
            pdf_path.relative_to(pdf_source_dir.resolve())
        except ValueError:
            rec = new_doc_record(rel, sha256="", size_bytes=None)
            rec["status"] = "failed"
            rec["error"] = "path_escapes_source_dir"
            manifest["documents"][rel] = rec
            save_manifest(paths["manifest"], manifest)
            results.append(rec)
            continue

        if not pdf_path.is_file():
            rec = new_doc_record(rel, sha256="", size_bytes=None)
            rec["status"] = "failed"
            rec["error"] = "pdf_missing"
            manifest["documents"][rel] = rec
            save_manifest(paths["manifest"], manifest)
            results.append(rec)
            continue

        file_hash = sha256_file(pdf_path)
        prev = manifest["documents"].get(rel)
        if should_skip_unchanged(prev, sha256=file_hash):
            skip = dict(prev)
            skip["skipped_unchanged"] = True
            results.append(skip)
            print(f"SKIP unchanged indexed: {rel}", flush=True)
            continue

        rec = new_doc_record(rel, sha256=file_hash, size_bytes=pdf_path.stat().st_size)
        rec["status"] = "processing"
        rec["started_at"] = utc_now()
        # drop old chunk ids from collection if reprocessing
        if prev and prev.get("indexed_chunk_ids"):
            _delete_previous_ids(collection, list(prev["indexed_chunk_ids"]))
        manifest["documents"][rel] = rec
        save_manifest(paths["manifest"], manifest)

        print(f"PROCESS {rel}", flush=True)
        try:
            out = process_one_pdf(
                rel=rel,
                pdf_path=pdf_path,
                collection=collection,
                paths=paths,
                diagnostics_root=diagnostics_root,
                ocr_dpi=ocr_dpi,
            )
            rec.update(out)
            rec["completed_at"] = utc_now()
            rec["extraction_version"] = EXTRACTION_VERSION
            rec["chunk_version"] = CHUNK_VERSION
            rec["embedding_model"] = PILOT_EMBEDDING_MODEL
        except Exception as exc:  # noqa: BLE001
            rec["status"] = "failed"
            rec["error"] = str(exc)[:500]
            rec["completed_at"] = utc_now()
            print(f"FAIL {rel}: {exc}", flush=True)

        manifest["documents"][rel] = rec
        save_manifest(paths["manifest"], manifest)
        results.append(rec)

    wall_s = time.perf_counter() - wall0
    disk_after = dir_size_bytes(paths["root"])
    chroma_after = dir_size_bytes(paths["chroma"])

    usable_total = sum(int(r.get("usable_chunk_count") or 0) for r in results)
    nr_total = sum(int(r.get("needs_review_chunk_count") or 0) for r in results)
    processed_ok = sum(1 for r in results if r.get("status") in ("indexed", "needs_review"))
    failed = sum(1 for r in results if r.get("status") == "failed")
    skipped = sum(1 for r in results if r.get("skipped_unchanged"))

    metrics = {
        "finished_at": utc_now(),
        "selection_path": str(selection_path),
        "collection": PILOT_COLLECTION_NAME,
        "model": model_label,
        "selected_count": len(selected),
        "processed_ok": processed_ok,
        "failed": failed,
        "skipped_unchanged": skipped,
        "recovered_processing": recovered,
        "usable_chunks_sum": usable_total,
        "needs_review_chunks_sum": nr_total,
        "collection_count": int(collection.count()),
        "wall_seconds": round(wall_s, 2),
        "disk_root_before_bytes": disk_before,
        "disk_root_after_bytes": disk_after,
        "disk_root_growth_bytes": disk_after - disk_before,
        "chroma_before_bytes": chroma_before,
        "chroma_after_bytes": chroma_after,
        "chroma_growth_bytes": chroma_after - chroma_before,
        "native_pages_sum": sum(int(r.get("native_page_count") or 0) for r in results),
        "ocr_pages_sum": sum(int(r.get("ocr_page_count") or 0) for r in results),
        "blank_pages_sum": sum(int(r.get("blank_skipped_page_count") or 0) for r in results),
        "baseline_must_include": list(BASELINE_MUST_INCLUDE),
        "protected_collections_untouched": sorted(PROTECTED_COLLECTIONS),
        "documents": results,
    }
    paths["metrics"].write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metrics
