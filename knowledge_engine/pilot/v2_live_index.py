"""
Live second-pilot indexing into bis_pilot_representative_v2 ONLY.

- 150 selection paths → content-hash units (expect 137 unique)
- Alias policy: extract/embed once per unique bytes; aliases share chunk identity
- v1 collections/manifests/chunks are read-only reuse sources
- Never writes protected collections
"""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from knowledge_engine.chunk_extract import (
    Chunk,
    build_chunks_from_summary,
    sha256_file,
    write_chunks_bundle,
)
from knowledge_engine.extract_pdf import extract_pdf_hybrid, write_extraction_diagnostics
from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    ContentIdentityRecord,
    require_alias_policy_ready,
)
from knowledge_engine.pilot.collection_guards import (
    ProtectedCollectionError,
    assert_collection_writable,
    assert_path_not_protected,
    assert_second_pilot_target,
)
from knowledge_engine.pilot.constants import (
    CHUNK_VERSION,
    EXTRACTION_VERSION,
    PILOT_COLLECTION_NAME,
    PILOT_EMBEDDING_MODEL,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.document_identity import (
    document_id_from_sha256,
    make_chunk_id,
    normalize_rel_path,
    sample_label_for_content,
)
from knowledge_engine.pilot.manifest import load_manifest, mark_stale_processing, save_manifest, utc_now
from knowledge_engine.pilot.pipeline import (
    BASELINE_LABELS,
    dir_size_bytes,
    folder_context,
    load_validated_baseline_chunks,
    prefer_project_tesseract,
)
from knowledge_engine.pilot.quality_gate import (
    apply_pilot_quality_gate,
    filter_usable_for_index,
)
from knowledge_engine.pilot.selection_validate import (
    SelectionValidationError,
    validate_second_pilot_selection,
)
from knowledge_engine.pilot.v2_plan import (
    V2PlanError,
    build_second_pilot_plan,
    load_v1_manifest_metadata,
)

# Expected from approved planning report (re-verified at preflight).
EXPECTED_ACTION_COUNTS = {
    "reuse": 39,
    "alias": 13,
    "new-content-plan": 98,
    "review-required": 0,
    "blocked": 0,
}
EXPECTED_UNIQUE = 137
EXPECTED_PATHS = 150

_CHUNK_TAIL_RE = re.compile(r":p(\d+):c(\d+)$", re.I)


class V2LiveIndexError(RuntimeError):
    """Fail-closed preflight / indexing error."""


def v2_paths(vector_db_path: Path) -> dict[str, Path]:
    root = vector_db_path / "sample_collections" / SECOND_PILOT_COLLECTION_NAME
    return {
        "root": root,
        "chroma": root / "chroma",
        "manifest": root / "manifest.json",
        "diagnostics": root / "diagnostics",
        "chunks": root / "chunks",
        "needs_review": root / "needs_review_chunks",
        "metrics": root / "metrics.json",
    }


def _check_local(path: Path) -> tuple[bool, str]:
    import stat as stat_mod

    uf_dataless = getattr(stat_mod, "UF_DATALESS", 0x40000000)
    try:
        if not path.is_file():
            return False, "missing_or_not_file"
        st = path.stat()
    except OSError as exc:
        return False, f"stat_error:{type(exc).__name__}"
    if getattr(st, "st_flags", 0) & uf_dataless:
        return False, "cloud_dataless"
    if st.st_size > 0 and st.st_blocks == 0:
        return False, "cloud_zero_blocks"
    return True, "ok"


def open_or_create_v2_collection(persist_dir: Path) -> tuple[str, Any]:
    import chromadb
    from knowledge_engine.scripts.compare_multilingual_ranking import FastEmbedMultilingualEF

    assert_second_pilot_target(SECOND_PILOT_COLLECTION_NAME)
    assert_collection_writable(SECOND_PILOT_COLLECTION_NAME, operation="open_or_create_v2")
    assert_path_not_protected(persist_dir, operation="v2_chroma_init")

    persist_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(persist_dir))
    names = [
        n if isinstance(n, str) else getattr(n, "name", str(n))
        for n in client.list_collections()
    ]
    for bad in PROTECTED_COLLECTIONS:
        if bad in names:
            raise ProtectedCollectionError(
                f"Refusing: protected collection {bad!r} appeared inside v2 chroma path"
            )
    if PILOT_COLLECTION_NAME in names:
        raise ProtectedCollectionError("Refusing: v1 collection name inside v2 chroma path")

    ef = FastEmbedMultilingualEF(PILOT_EMBEDDING_MODEL)
    col = client.get_or_create_collection(
        name=SECOND_PILOT_COLLECTION_NAME,
        embedding_function=ef,
        metadata={
            "purpose": "bis_representative_pilot_v2",
            "model": PILOT_EMBEDDING_MODEL,
            "backend": "fastembed-onnx",
            "extraction_version": EXTRACTION_VERSION,
            "chunk_version": CHUNK_VERSION,
            "alias_policy": "second_pilot_alias_policy_v1",
        },
    )
    return f"fastembed:{PILOT_EMBEDDING_MODEL}", col


def remint_chunks_to_content_ids(
    chunks: list[Chunk],
    *,
    sha256: str,
    primary_path: str,
) -> list[Chunk]:
    """Rewrite chunk_ids to content-hash scheme; keep texts. Path metadata → primary."""
    out: list[Chunk] = []
    for i, ch in enumerate(chunks):
        m = _CHUNK_TAIL_RE.search(ch.chunk_id or "")
        if m:
            page, ordinal = int(m.group(1)), int(m.group(2))
        else:
            page = (ch.pdf_pages[0] if ch.pdf_pages else 1) or 1
            ordinal = i + 1
        new_id = make_chunk_id(sha256=sha256, page_number=page, ordinal=ordinal)
        out.append(
            Chunk(
                chunk_id=new_id,
                source_relative_path=primary_path,
                source_file_hash=sha256.lower(),
                pdf_pages=list(ch.pdf_pages or []),
                clause_number=ch.clause_number,
                extraction_method=ch.extraction_method,
                review_status=ch.review_status,
                text=ch.text,
                char_count=ch.char_count,
                text_quality_status=ch.text_quality_status,
                visual_verification_status=ch.visual_verification_status,
                review_reasons=list(ch.review_reasons or []),
                text_sha256=ch.text_sha256,
                text_version=ch.text_version,
                native_text=ch.native_text,
                ocr_text=ch.ocr_text,
            )
        )
    return out


def load_v1_chunks_for_path(
    *,
    v1_root: Path,
    rel: str,
    sha256: str,
    v1_manifest_docs: dict[str, dict[str, Any]],
) -> list[Chunk] | None:
    """Read-only load of v1 chunk bundle when hash matches. Never opens v1 Chroma for write."""
    rec = v1_manifest_docs.get(normalize_rel_path(rel))
    if not rec:
        return None
    stored = (rec.get("sha256") or "").lower()
    if stored != sha256.lower():
        return None
    label = rec.get("sample_label")
    if not label:
        # derive from path as v1 did
        from knowledge_engine.pilot.pipeline import sample_label_for

        label = sample_label_for(rel)
    path = v1_root / "chunks" / f"{label}__chunks.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    file_hash = (data.get("source_file_hash_sha256") or "").lower()
    if file_hash and file_hash != sha256.lower():
        return None
    chunks: list[Chunk] = []
    for raw in data.get("chunks") or []:
        chunks.append(
            Chunk(
                chunk_id=raw["chunk_id"],
                source_relative_path=raw.get("source_relative_path") or rel,
                source_file_hash=raw.get("source_file_hash") or sha256,
                pdf_pages=list(raw.get("pdf_pages") or []),
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
    return chunks or None


def chunk_to_metadata_v2(
    ch: Chunk,
    *,
    sample_label: str,
    document_type: str | None,
    document_id: str,
    source_aliases: list[str],
    alias_decision: str | None,
    is_number_override: str | None,
    forbid_is_number: bool,
    force_review_status: str | None,
) -> dict[str, Any]:
    import json as _json

    review = force_review_status or ch.review_status
    if forbid_is_number:
        is_no = ""
    elif is_number_override is not None:
        # heuristic only — stored as unverified empty for filter safety when null policy
        is_no = ""
    else:
        # Do not promote folder heuristics to verified filter field for v2 pilot
        is_no = ""

    meta: dict[str, Any] = {
        "chunk_id": ch.chunk_id,
        "source_relative_path": ch.source_relative_path,
        "source_file_hash": ch.source_file_hash,
        "pdf_pages": _json.dumps(ch.pdf_pages),
        "clause_number": ch.clause_number or "",
        "extraction_method": ch.extraction_method,
        "review_status": review,
        "text_quality_status": ch.text_quality_status,
        "visual_verification_status": ch.visual_verification_status,
        "sample_label": sample_label,
        "text_sha256": ch.text_sha256,
        "text_version": ch.text_version,
        "is_number": is_no,
        "is_number_verified": False,
        "document_type": document_type or "",
        "corpus": "pilot_v2",
        "document_id": document_id,
        "alias_decision": alias_decision or "",
        "source_alias_count": len(source_aliases),
    }
    # Keep alias list short in metadata (full list in manifest)
    if len(source_aliases) <= 6:
        meta["source_aliases_json"] = _json.dumps(source_aliases, ensure_ascii=False)
    return meta


def _upsert_usable_v2(
    collection: Any,
    chunks: list[Chunk],
    *,
    sample_label: str,
    document_type: str,
    document_id: str,
    source_aliases: list[str],
    alias_decision: str | None,
    is_number_override: str | None,
    forbid_is_number: bool,
    force_review_status: str | None,
) -> list[str]:
    if not chunks:
        return []
    # If forced needs_review on content, do not upsert as usable
    if force_review_status and force_review_status != "usable":
        return []
    usable = [c for c in chunks if c.review_status == "usable"]
    if not usable:
        return []
    ids = [c.chunk_id for c in usable]
    docs = [c.text for c in usable]
    metas = [
        chunk_to_metadata_v2(
            c,
            sample_label=sample_label,
            document_type=document_type,
            document_id=document_id,
            source_aliases=source_aliases,
            alias_decision=alias_decision,
            is_number_override=is_number_override,
            forbid_is_number=forbid_is_number,
            force_review_status=force_review_status,
        )
        for c in usable
    ]
    batch = 64
    for i in range(0, len(ids), batch):
        collection.upsert(
            ids=ids[i : i + batch],
            documents=docs[i : i + batch],
            metadatas=metas[i : i + batch],
        )
    return ids


def preflight_second_pilot_index(
    *,
    selection: dict[str, Any],
    existing_v1_selection: dict[str, Any],
    pdf_source_dir: Path,
    v1_root: Path,
    expected_action_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """
    Fail-closed checks before any v2 Chroma write.
    Hashes the 150 local files; does not OCR/embed.
    """
    expected_action_counts = expected_action_counts or EXPECTED_ACTION_COUNTS
    try:
        assert_second_pilot_target(selection.get("proposed_collection"))
        validate_second_pilot_selection(selection, existing_v1_selection=existing_v1_selection)
    except (ProtectedCollectionError, SelectionValidationError) as exc:
        raise V2LiveIndexError(f"selection_guard:{exc}") from exc

    rows = selection.get("selected") or []
    if len(rows) != EXPECTED_PATHS:
        raise V2LiveIndexError(f"selection_count:{len(rows)}")

    paths = [normalize_rel_path(str(r["relative_path"])) for r in rows]
    if len(set(paths)) != EXPECTED_PATHS:
        raise V2LiveIndexError("duplicate_relative_paths")

    # Local availability
    blocked = []
    for rel in paths:
        ok, reason = _check_local(pdf_source_dir / rel)
        if not ok:
            blocked.append({"relative_path": rel, "reason": reason})
    if blocked:
        raise V2LiveIndexError(f"local_unavailable:{blocked[0]['relative_path']}:{blocked[0]['reason']}")

    # Hash all 150
    hashes_by_path: dict[str, str] = {}
    hash_to_paths: dict[str, list[str]] = defaultdict(list)
    for rel in paths:
        digest = sha256_file(pdf_source_dir / rel)
        hashes_by_path[rel] = digest
        hash_to_paths[digest].append(rel)

    unique = len(hash_to_paths)
    if unique != EXPECTED_UNIQUE:
        raise V2LiveIndexError(f"unique_content_count:{unique}_expected_{EXPECTED_UNIQUE}")

    try:
        policy, records, units = require_alias_policy_ready(
            selection=selection,
            observed_hashes_by_path=hashes_by_path,
        )
    except AliasPolicyError as exc:
        raise V2LiveIndexError(f"alias_policy:{exc}") from exc

    if len(records) != 7 or len(units) != 7:
        raise V2LiveIndexError(f"alias_group_count:{len(records)}")

    # Policy path membership vs live hash groups
    for rec in records:
        live = sorted(hash_to_paths.get(rec.sha256, []))
        expected = sorted(rec.source_aliases)
        if live != expected:
            raise V2LiveIndexError(
                f"policy_membership_mismatch:{rec.group_id}:live={live!r}:policy={expected!r}"
            )

    v1_docs = load_v1_manifest_metadata(v1_root / "manifest.json")
    try:
        plan = build_second_pilot_plan(
            selection=selection,
            existing_v1_selection=existing_v1_selection,
            v1_manifest_docs=v1_docs,
        )
    except V2PlanError as exc:
        raise V2LiveIndexError(f"plan:{exc}") from exc

    actions = plan.get("action_counts") or {}
    for k, v in expected_action_counts.items():
        if int(actions.get(k, -1)) != int(v):
            raise V2LiveIndexError(
                f"action_count_mismatch:{k}:got={actions.get(k)}:expected={v}:full={actions}"
            )

    return {
        "ok": True,
        "selection_path_count": EXPECTED_PATHS,
        "unique_byte_content_count": unique,
        "alias_groups": 7,
        "action_counts": actions,
        "policy_id": policy.get("policy_id"),
        "hashes_by_path": hashes_by_path,
        "hash_to_paths": {k: list(v) for k, v in hash_to_paths.items()},
        "records": records,
        "units": units,
        "v1_manifest_docs": v1_docs,
        "plan": plan,
    }


def _apply_policy_chunk_overrides(
    chunks: list[Chunk],
    rec: ContentIdentityRecord | None,
) -> list[Chunk]:
    if not rec:
        return chunks
    if rec.quality_review_status == "needs_review" or rec.quality_classification == "suspect":
        for ch in chunks:
            if ch.review_status == "usable":
                ch.review_status = "needs_review"
                reasons = list(ch.review_reasons or [])
                reasons.append("alias_policy_g6_suspect_override")
                ch.review_reasons = reasons
    return chunks


def process_content_unit(
    *,
    sha256: str,
    paths: list[str],
    primary_path: str,
    pdf_source_dir: Path,
    collection: Any,
    paths_fs: dict[str, Path],
    diagnostics_root: Path,
    v1_root: Path,
    v1_manifest_docs: dict[str, dict[str, Any]],
    alias_rec: ContentIdentityRecord | None,
    ocr_dpi: int,
) -> dict[str, Any]:
    prefer_project_tesseract()
    t_all = time.perf_counter()
    did = document_id_from_sha256(sha256)
    label = sample_label_for_content(sha256)
    doc_type = folder_context(primary_path)
    aliases = sorted(set(normalize_rel_path(p) for p in paths))
    pdf_path = (pdf_source_dir / primary_path).resolve()
    pdf_path.relative_to(pdf_source_dir.resolve())

    forbid_is = bool(alias_rec and alias_rec.forbid_folder_inferred_is_number)
    is_override = alias_rec.is_number_heuristic if alias_rec else None
    force_review = alias_rec.quality_review_status if alias_rec else None
    decision = alias_rec.decision if alias_rec else None

    timings: dict[str, float] = {}
    native_pages = ocr_pages = blank_pages = 0
    page_count = None
    source_mode = "freshly_extracted"
    extract_calls = 0
    ocr_used = False

    # 1) Try validated baseline import (9666 / 2676)
    t0 = time.perf_counter()
    validated = load_validated_baseline_chunks(
        diagnostics_root=diagnostics_root, rel=primary_path, file_hash=sha256
    )
    timings["validated_lookup"] = time.perf_counter() - t0

    chunks: list[Chunk] | None = None
    if validated is not None:
        source_mode = "validated_import"
        chunks = remint_chunks_to_content_ids(validated, sha256=sha256, primary_path=primary_path)
        page_count = max((max(c.pdf_pages) for c in chunks if c.pdf_pages), default=0) or None
        for c in chunks:
            if (c.extraction_method or "").startswith("ocr"):
                ocr_pages += 1
            else:
                native_pages += 1
    else:
        # 2) Try v1 chunk bundle reuse (read-only filesystem)
        t0 = time.perf_counter()
        # Prefer policy reuse candidate, then any alias path present in v1 manifest
        reuse_candidates = []
        if alias_rec and alias_rec.v1_reuse_candidate_path:
            reuse_candidates.append(alias_rec.v1_reuse_candidate_path)
        reuse_candidates.extend(aliases)
        seen: set[str] = set()
        for cand in reuse_candidates:
            if cand in seen:
                continue
            seen.add(cand)
            loaded = load_v1_chunks_for_path(
                v1_root=v1_root,
                rel=cand,
                sha256=sha256,
                v1_manifest_docs=v1_manifest_docs,
            )
            if loaded:
                source_mode = "v1_chunk_reuse"
                chunks = remint_chunks_to_content_ids(loaded, sha256=sha256, primary_path=primary_path)
                page_count = max((max(c.pdf_pages) for c in chunks if c.pdf_pages), default=0) or None
                for c in chunks:
                    if (c.extraction_method or "").startswith("ocr"):
                        ocr_pages += 1
                    else:
                        native_pages += 1
                break
        timings["v1_reuse_lookup"] = time.perf_counter() - t0

    if chunks is None:
        # 3) Fresh extract + OCR once for this content
        extract_calls = 1
        t0 = time.perf_counter()
        render_dir = paths_fs["diagnostics"] / label / "ocr_renders"
        result = extract_pdf_hybrid(
            pdf_path,
            relative_path=primary_path,
            enable_ocr=True,
            render_dir=render_dir,
            ocr_dpi=ocr_dpi,
            ocr_lang="eng+hin",
        )
        timings["extract_ocr"] = time.perf_counter() - t0
        ocr_used = True
        page_count = result.page_count
        native_pages = result.pages_native
        ocr_pages = result.pages_ocr
        blank_pages = result.pages_blank_skipped

        sample_diag = paths_fs["diagnostics"] / label
        sample_diag.mkdir(parents=True, exist_ok=True)
        outputs = write_extraction_diagnostics(result, sample_diag)
        summary = json.loads(Path(outputs["summary_json"]).read_text(encoding="utf-8"))

        t0 = time.perf_counter()
        raw_chunks = build_chunks_from_summary(
            summary,
            source_file_hash=sha256,
            sample_label=label,
        )
        chunks = apply_pilot_quality_gate(raw_chunks)
        chunks = remint_chunks_to_content_ids(chunks, sha256=sha256, primary_path=primary_path)
        timings["chunk_gate"] = time.perf_counter() - t0
        source_mode = "freshly_extracted"

    chunks = _apply_policy_chunk_overrides(chunks, alias_rec)
    usable = filter_usable_for_index(chunks)
    if force_review and force_review != "usable":
        # Policy: do not index as usable
        usable = []
    needs_review = [c for c in chunks if c.review_status == "needs_review"]

    write_chunks_bundle(
        out_dir=paths_fs["chunks"],
        sample_label=label,
        relative_path=primary_path,
        source_file_hash=sha256,
        chunks=chunks,
        summary_stats={
            "page_count": page_count,
            "pages_native": native_pages,
            "pages_ocr": ocr_pages,
            "pages_blank_skipped": blank_pages,
            "usable": len(usable),
            "needs_review": len(needs_review),
            "source_mode": source_mode,
            "source_aliases": aliases,
            "document_id": did,
        },
    )
    if needs_review:
        write_chunks_bundle(
            out_dir=paths_fs["needs_review"],
            sample_label=label,
            relative_path=primary_path,
            source_file_hash=sha256,
            chunks=needs_review,
            summary_stats={"note": "needs_review_only", "source_aliases": aliases},
        )

    t0 = time.perf_counter()
    indexed_ids = _upsert_usable_v2(
        collection,
        usable if not (force_review and force_review != "usable") else [],
        sample_label=label,
        document_type=doc_type,
        document_id=did,
        source_aliases=aliases,
        alias_decision=decision,
        is_number_override=is_override,
        forbid_is_number=forbid_is or (alias_rec.group_id.startswith("g5") if alias_rec else False),
        force_review_status=force_review,
    )
    # When force_review, usable count for metrics stays 0 even if gate said usable
    usable_count = len(indexed_ids)
    nr_count = len(needs_review) if force_review else len(needs_review)
    if force_review and force_review != "usable":
        nr_count = max(nr_count, len(chunks))
    timings["embed_upsert"] = time.perf_counter() - t0
    timings["total"] = time.perf_counter() - t_all

    status = "indexed" if usable_count else ("needs_review" if nr_count else "failed")
    if force_review and force_review != "usable" and chunks:
        status = "needs_review"

    return {
        "document_id": did,
        "sha256": sha256.lower(),
        "source_relative_path": primary_path,
        "source_aliases": aliases,
        "alias_path_count": len(aliases),
        "alias_decision": decision,
        "alias_group_id": alias_rec.group_id if alias_rec else None,
        "file_size": pdf_path.stat().st_size,
        "page_count": page_count,
        "status": status,
        "usable_chunk_count": usable_count,
        "needs_review_chunk_count": nr_count,
        "native_page_count": native_pages,
        "ocr_page_count": ocr_pages,
        "blank_skipped_page_count": blank_pages,
        "indexed_chunk_ids": indexed_ids,
        "source_mode": source_mode,
        "extract_calls": extract_calls,
        "ocr_used": ocr_used,
        "embed_calls": 1 if indexed_ids or (chunks and source_mode) else 0,
        "timings_sec": {k: round(v, 3) for k, v in timings.items()},
        "sample_label": label,
        "document_type": doc_type,
        "quality_review_status": force_review,
        "is_number_verified": False,
        "error": None if status != "failed" else "no_chunks_produced",
        "completed_at": utc_now(),
    }


def run_second_pilot_indexing(
    *,
    selection_path: Path,
    existing_v1_selection_path: Path,
    pdf_source_dir: Path,
    vector_db_path: Path,
    diagnostics_root: Path,
    ocr_dpi: int = 200,
) -> dict[str, Any]:
    prefer_project_tesseract()
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    existing_v1 = json.loads(existing_v1_selection_path.read_text(encoding="utf-8"))
    v1_root = vector_db_path / "sample_collections" / PILOT_COLLECTION_NAME

    print("=== PREFLIGHT (hash + policy + plan recount) ===", flush=True)
    pre = preflight_second_pilot_index(
        selection=selection,
        existing_v1_selection=existing_v1,
        pdf_source_dir=pdf_source_dir,
        v1_root=v1_root,
    )
    print(
        f"PREFLIGHT OK paths={pre['selection_path_count']} unique={pre['unique_byte_content_count']} "
        f"actions={pre['action_counts']}",
        flush=True,
    )

    paths_fs = v2_paths(vector_db_path)
    for key in ("root", "chroma", "diagnostics", "chunks", "needs_review"):
        assert_path_not_protected(paths_fs[key], operation="v2_mkdir")
        # Ensure we are under v2 only
        if SECOND_PILOT_COLLECTION_NAME not in str(paths_fs[key]):
            raise V2LiveIndexError(f"path_not_under_v2:{key}")
        paths_fs[key].mkdir(parents=True, exist_ok=True)

    disk_before = dir_size_bytes(paths_fs["root"])
    chroma_before = dir_size_bytes(paths_fs["chroma"])

    model_label, collection = open_or_create_v2_collection(paths_fs["chroma"])
    manifest = load_manifest(paths_fs["manifest"])
    manifest["collection_name"] = SECOND_PILOT_COLLECTION_NAME
    recovered = mark_stale_processing(manifest)
    if recovered:
        save_manifest(paths_fs["manifest"], manifest)

    # Map sha → alias record
    by_sha_rec = {r.sha256: r for r in pre["records"]}
    hash_to_paths: dict[str, list[str]] = pre["hash_to_paths"]
    v1_docs = pre["v1_manifest_docs"]

    # Primary path per content: policy reuse candidate / canonical / first
    def primary_for(sha: str, paths: list[str]) -> str:
        rec = by_sha_rec.get(sha)
        if rec and rec.v1_reuse_candidate_path and rec.v1_reuse_candidate_path in paths:
            return rec.v1_reuse_candidate_path
        if rec:
            cans = [p.relative_path for p in rec.path_records if p.role == "canonical"]
            if cans and cans[0] in paths:
                return cans[0]
        # Prefer a path that exists in v1 manifest
        for p in paths:
            if p in v1_docs and (v1_docs[p].get("sha256") or "").lower() == sha:
                return p
        return sorted(paths)[0]

    wall0 = time.perf_counter()
    results: list[dict[str, Any]] = []
    extract_total = 0
    reused = 0
    aliased_paths = 0
    new_content = 0

    # Process each unique content once
    units_sorted = sorted(hash_to_paths.items(), key=lambda kv: (len(kv[1]) == 1, kv[1][0]))
    for i, (sha, path_list) in enumerate(units_sorted, start=1):
        path_list = [normalize_rel_path(p) for p in path_list]
        primary = primary_for(sha, path_list)
        rec = by_sha_rec.get(sha)
        did = document_id_from_sha256(sha)

        prev = manifest["documents"].get(did)
        if prev and prev.get("sha256") == sha and prev.get("status") in ("indexed", "needs_review") and prev.get("completed_at"):
            skip = dict(prev)
            skip["skipped_unchanged"] = True
            results.append(skip)
            print(f"[{i}/{len(units_sorted)}] SKIP unchanged {did[:20]}… aliases={len(path_list)}", flush=True)
            continue

        print(
            f"[{i}/{len(units_sorted)}] PROCESS sha={sha[:12]}… paths={len(path_list)} "
            f"primary={primary} group={rec.group_id if rec else '-'}",
            flush=True,
        )
        try:
            out = process_content_unit(
                sha256=sha,
                paths=path_list,
                primary_path=primary,
                pdf_source_dir=pdf_source_dir,
                collection=collection,
                paths_fs=paths_fs,
                diagnostics_root=diagnostics_root,
                v1_root=v1_root,
                v1_manifest_docs=v1_docs,
                alias_rec=rec,
                ocr_dpi=ocr_dpi,
            )
            extract_total += int(out.get("extract_calls") or 0)
            if out.get("source_mode") in ("v1_chunk_reuse", "validated_import"):
                reused += 1
            elif out.get("source_mode") == "freshly_extracted":
                new_content += 1
            aliased_paths += max(0, len(path_list) - 1)
            out["started_at"] = utc_now()
            manifest["documents"][did] = out
            save_manifest(paths_fs["manifest"], manifest)
            results.append(out)
            print(
                f"  → {out['status']} usable={out['usable_chunk_count']} "
                f"nr={out['needs_review_chunk_count']} mode={out['source_mode']}",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001
            fail = {
                "document_id": did,
                "sha256": sha,
                "source_relative_path": primary,
                "source_aliases": path_list,
                "status": "failed",
                "error": str(exc)[:500],
                "completed_at": utc_now(),
                "usable_chunk_count": 0,
                "needs_review_chunk_count": 0,
                "indexed_chunk_ids": [],
                "extract_calls": 0,
            }
            manifest["documents"][did] = fail
            save_manifest(paths_fs["manifest"], manifest)
            results.append(fail)
            print(f"  FAIL {exc}", flush=True)

    wall_s = time.perf_counter() - wall0
    disk_after = dir_size_bytes(paths_fs["root"])
    chroma_after = dir_size_bytes(paths_fs["chroma"])

    metrics = {
        "finished_at": utc_now(),
        "selection_id": selection.get("selection_id"),
        "collection": SECOND_PILOT_COLLECTION_NAME,
        "model": model_label,
        "selection_path_count": EXPECTED_PATHS,
        "unique_content_units": len(units_sorted),
        "manifest_document_count": len(manifest.get("documents") or {}),
        "collection_count": int(collection.count()),
        "processed_ok": sum(1 for r in results if r.get("status") in ("indexed", "needs_review")),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
        "skipped_unchanged": sum(1 for r in results if r.get("skipped_unchanged")),
        "content_units_reused": reused,
        "content_units_new_extract": new_content,
        "alias_extra_path_slots": aliased_paths,
        "extract_calls_total": extract_total,
        "usable_chunks_sum": sum(int(r.get("usable_chunk_count") or 0) for r in results),
        "needs_review_chunks_sum": sum(int(r.get("needs_review_chunk_count") or 0) for r in results),
        "native_pages_sum": sum(int(r.get("native_page_count") or 0) for r in results),
        "ocr_pages_sum": sum(int(r.get("ocr_page_count") or 0) for r in results),
        "blank_pages_sum": sum(int(r.get("blank_skipped_page_count") or 0) for r in results),
        "wall_seconds": round(wall_s, 2),
        "disk_root_growth_bytes": disk_after - disk_before,
        "chroma_growth_bytes": chroma_after - chroma_before,
        "preflight_action_counts": pre["action_counts"],
        "protected_collections_untouched": sorted(PROTECTED_COLLECTIONS),
        "source_pdfs_modified": False,
        "documents": results,
    }
    paths_fs["metrics"].write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return metrics
