"""
Offline document-identity review registry (Phase A).

Separates:
  - content identity (SHA-256) — Document IS annotations live here
  - path occurrence / alias records — Parent STD context lives here (per path)

Status and provenance are separate fields. Filename/folder heuristics never
auto-promote to verified.

Does not touch live filters, Chroma, gold, selection, or alias policy.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from knowledge_engine.pilot.document_identity import (
    document_id_from_sha256,
    normalize_rel_path,
)

REGISTRY_ID = "document_identity_review_registry_v1"
SCHEMA_VERSION = "1.0.0"

STATUSES = frozenset({"unverified", "needs_review", "verified", "rejected"})
PROVENANCES = frozenset(
    {
        "filename_heuristic",
        "path_folder_heuristic",
        "human_review_with_evidence",
        "unavailable",
        "seed_from_review_packet",
    }
)
HEURISTIC_PROVENANCES = frozenset(
    {"filename_heuristic", "path_folder_heuristic", "seed_from_review_packet"}
)
OCCURRENCE_PATH_STATUSES = frozenset({"active", "superseded", "alias"})
LINK_RELATIONS = frozenset({"renamed_to", "copied_to", "alias_of"})

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_IS_TOKEN_RE = re.compile(r"\bIS\s*[:\-]?\s*(\d+)\b", re.I)
_STD_FOLDER_RE = re.compile(r"^STD\s+(\d+)\b", re.I)

FORBIDDEN_OVERWRITE_NAMES = frozenset(
    {
        "reliability_eval_v1.json",
        "pilot_eval_v1.json",
        "alias_policy_v1.json",
        "pilot_selection_v2_selected.json",
        "post_v2_retrieval_validation_v1.json",
        "post_v2_answerability_diagnosis_v1.json",
        "standard_filter_v2_candidate_eval_v1.json",
        "proposed_unverified_gold_v2_plus20_v1.json",
        "human_review_packet_v2_standard_filter_v1.json",
        "human_review_packet_v2_standard_filter_v1.md",
        "manifest.json",
        "metrics.json",
    }
)


class ReviewRegistryValidationError(ValueError):
    """Fail-closed validation error for the review registry."""


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise ReviewRegistryValidationError(msg)


def normalize_sha256(value: str | None) -> str:
    digest = (value or "").strip().lower()
    _require(bool(_SHA256_RE.match(digest)), f"invalid sha256: {value!r}")
    return digest


def filename_is_heuristic(rel: str) -> str | None:
    name = Path(normalize_rel_path(rel)).name
    m = _IS_TOKEN_RE.search(name)
    return f"IS {m.group(1)}" if m else None


def parent_std_from_path(rel: str) -> tuple[str | None, str | None]:
    parts = Path(normalize_rel_path(rel)).parts
    folder = parts[0] if parts else None
    if not folder:
        return None, None
    m = _STD_FOLDER_RE.match(folder)
    return folder, (m.group(1) if m else None)


def empty_field_annotation(
    *,
    status: str = "needs_review",
    provenance: str = "unavailable",
    value: str | None = None,
) -> dict[str, Any]:
    return {
        "value": value,
        "status": status,
        "provenance": provenance,
        "evidence": None,
        "reviewer": None,
        "reviewed_at": None,
        "notes": [],
    }


def make_occurrence_id(*, sha256: str, source_relative_path: str) -> str:
    """Deterministic occurrence id for a content+path pair (active records)."""
    digest = normalize_sha256(sha256)
    rel = normalize_rel_path(source_relative_path)
    # Stable without importing hashlib collision risk across renames: include both.
    import hashlib

    token = hashlib.sha256(f"{digest}|{rel}".encode("utf-8")).hexdigest()[:16]
    return f"occ_{token}"


def new_registry(*, notes: list[str] | None = None) -> dict[str, Any]:
    return {
        "registry_id": REGISTRY_ID,
        "schema_version": SCHEMA_VERSION,
        "generated_at": _utc(),
        "purpose": (
            "Offline human-review registry: content SHA-256 identity vs path "
            "occurrence Parent STD; status separate from provenance."
        ),
        "constraints_honored": {
            "live_filter_unchanged": True,
            "chroma_untouched": True,
            "authoritative_gold_untouched": True,
            "selection_untouched": True,
            "alias_policy_untouched": True,
            "source_packet_untouched": True,
        },
        "notes": list(notes or []),
        "content_records": [],
        "path_occurrences": [],
        "occurrence_links": [],
        "review_queue": [],
        "unresolved_summary": {
            "needs_review_document_is": 0,
            "needs_review_parent_std": 0,
            "unverified_document_is": 0,
            "unverified_parent_std": 0,
            "rejected_document_is": 0,
            "rejected_parent_std": 0,
            "folder_only_or_missing_document_is": 0,
            "filename_vs_parent_conflicts": 0,
            "queue_item_count": 0,
        },
    }


def _validate_annotation(
    ann: dict[str, Any],
    *,
    field_name: str,
    loc: str,
) -> None:
    _require(isinstance(ann, dict), f"{loc}: {field_name} must be object")
    status = ann.get("status")
    provenance = ann.get("provenance")
    _require(status in STATUSES, f"{loc}: {field_name}.status invalid: {status!r}")
    _require(
        provenance in PROVENANCES,
        f"{loc}: {field_name}.provenance invalid: {provenance!r}",
    )
    # Heuristics must never be verified
    if provenance in HEURISTIC_PROVENANCES:
        _require(
            status != "verified",
            f"{loc}: {field_name} provenance {provenance} cannot be status=verified",
        )
    if status == "verified":
        _require(
            provenance == "human_review_with_evidence",
            f"{loc}: verified {field_name} requires provenance=human_review_with_evidence",
        )
        evidence = ann.get("evidence")
        _require(isinstance(evidence, dict), f"{loc}: verified {field_name} missing evidence")
        _require(
            bool(evidence.get("chunk_id") or evidence.get("excerpt_ref") or evidence.get("note")),
            f"{loc}: verified {field_name} evidence incomplete",
        )
        reviewer = ann.get("reviewer")
        _require(
            isinstance(reviewer, str) and reviewer.strip(),
            f"{loc}: verified {field_name} missing reviewer",
        )
        reviewed_at = ann.get("reviewed_at")
        _require(
            isinstance(reviewed_at, str) and reviewed_at.strip(),
            f"{loc}: verified {field_name} missing reviewed_at",
        )
        value = ann.get("value")
        _require(
            isinstance(value, str) and value.strip(),
            f"{loc}: verified {field_name} requires non-empty value",
        )


def validate_review_registry(data: dict[str, Any]) -> dict[str, Any]:
    """
    Fail-closed schema validation.

    Accepts distinct Parent STD contexts for the same SHA-256 across paths.
    Rejects duplicate/ambiguous active path occurrences, bad hashes/statuses,
    missing provenance, and verified rows without human evidence/reviewer.
    """
    _require(isinstance(data, dict), "registry root must be object")
    _require(data.get("registry_id") == REGISTRY_ID, "registry_id mismatch")
    _require(
        data.get("schema_version") == SCHEMA_VERSION,
        f"schema_version must be {SCHEMA_VERSION!r}",
    )

    contents = data.get("content_records")
    occurrences = data.get("path_occurrences")
    links = data.get("occurrence_links")
    queue = data.get("review_queue")
    _require(isinstance(contents, list), "content_records must be list")
    _require(isinstance(occurrences, list), "path_occurrences must be list")
    _require(isinstance(links, list), "occurrence_links must be list")
    _require(isinstance(queue, list), "review_queue must be list")

    content_by_sha: dict[str, dict[str, Any]] = {}
    for i, rec in enumerate(contents):
        loc = f"content_records[{i}]"
        _require(isinstance(rec, dict), f"{loc} must be object")
        sha = normalize_sha256(rec.get("sha256"))
        content_id = rec.get("content_id")
        expected_id = document_id_from_sha256(sha)
        _require(content_id == expected_id, f"{loc}: content_id must be {expected_id}")
        _require(sha not in content_by_sha, f"{loc}: duplicate content sha256 {sha}")
        _validate_annotation(rec.get("document_is") or {}, field_name="document_is", loc=loc)
        content_by_sha[sha] = rec

    occ_by_id: dict[str, dict[str, Any]] = {}
    active_path_owner: dict[str, str] = {}
    for i, occ in enumerate(occurrences):
        loc = f"path_occurrences[{i}]"
        _require(isinstance(occ, dict), f"{loc} must be object")
        oid = occ.get("occurrence_id")
        _require(isinstance(oid, str) and oid.strip(), f"{loc}: missing occurrence_id")
        _require(oid not in occ_by_id, f"{loc}: duplicate occurrence_id {oid}")
        sha = normalize_sha256(occ.get("sha256"))
        _require(sha in content_by_sha, f"{loc}: sha256 not in content_records: {sha}")
        rel = normalize_rel_path(str(occ.get("source_relative_path") or ""))
        _require(bool(rel), f"{loc}: missing source_relative_path")
        path_status = occ.get("path_status")
        _require(
            path_status in OCCURRENCE_PATH_STATUSES,
            f"{loc}: invalid path_status {path_status!r}",
        )
        if path_status == "active":
            if rel in active_path_owner:
                raise ReviewRegistryValidationError(
                    f"{loc}: duplicate/ambiguous active path {rel!r} "
                    f"(also {active_path_owner[rel]})"
                )
            active_path_owner[rel] = oid
        _validate_annotation(occ.get("parent_std") or {}, field_name="parent_std", loc=loc)
        # Rename pointers must be consistent when present
        rep_by = occ.get("replaced_by_occurrence_id")
        replaces = occ.get("replaces_occurrence_id")
        if path_status == "superseded":
            _require(
                isinstance(rep_by, str) and rep_by.strip(),
                f"{loc}: superseded occurrence requires replaced_by_occurrence_id",
            )
        if rep_by is not None:
            _require(isinstance(rep_by, str) and rep_by.strip(), f"{loc}: bad replaced_by")
        if replaces is not None:
            _require(isinstance(replaces, str) and replaces.strip(), f"{loc}: bad replaces")
        occ_by_id[oid] = occ

    for i, occ in enumerate(occurrences):
        loc = f"path_occurrences[{i}]"
        for key in ("replaced_by_occurrence_id", "replaces_occurrence_id"):
            ref = occ.get(key)
            if ref is None:
                continue
            _require(ref in occ_by_id, f"{loc}: {key} unknown occurrence {ref}")
            _require(ref != occ.get("occurrence_id"), f"{loc}: {key} self-reference")

    for i, link in enumerate(links):
        loc = f"occurrence_links[{i}]"
        _require(isinstance(link, dict), f"{loc} must be object")
        frm = link.get("from_occurrence_id")
        to = link.get("to_occurrence_id")
        reln = link.get("relation")
        _require(frm in occ_by_id, f"{loc}: unknown from_occurrence_id")
        _require(to in occ_by_id, f"{loc}: unknown to_occurrence_id")
        _require(reln in LINK_RELATIONS, f"{loc}: invalid relation {reln!r}")

    for i, item in enumerate(queue):
        loc = f"review_queue[{i}]"
        _require(isinstance(item, dict), f"{loc} must be object")
        _require(item.get("occurrence_id") in occ_by_id, f"{loc}: unknown occurrence_id")
        _require(normalize_sha256(item.get("sha256")) in content_by_sha, f"{loc}: bad sha256")

    return {
        "ok": True,
        "content_record_count": len(content_by_sha),
        "path_occurrence_count": len(occ_by_id),
        "active_path_count": len(active_path_owner),
        "occurrence_link_count": len(links),
        "review_queue_count": len(queue),
    }


def upsert_content_record(
    registry: dict[str, Any],
    *,
    sha256: str,
    document_is: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sha = normalize_sha256(sha256)
    cid = document_id_from_sha256(sha)
    for rec in registry["content_records"]:
        if rec.get("sha256") == sha:
            if document_is is not None:
                # Do not silently upgrade heuristic → verified
                existing = rec.get("document_is") or {}
                if (
                    existing.get("status") == "verified"
                    and (document_is.get("status") or "") != "verified"
                ):
                    return rec
                if document_is.get("status") == "verified" and document_is.get(
                    "provenance"
                ) in HEURISTIC_PROVENANCES:
                    raise ReviewRegistryValidationError(
                        "refusing to set verified document_is from heuristic provenance"
                    )
                # Conflicting non-null values → needs_review
                old_v = existing.get("value")
                new_v = document_is.get("value")
                if old_v and new_v and old_v != new_v:
                    document_is = {
                        **document_is,
                        "status": "needs_review",
                        "notes": list(document_is.get("notes") or [])
                        + [f"conflicting values {old_v!r} vs {new_v!r}"],
                    }
                rec["document_is"] = document_is
            return rec
    rec = {
        "content_id": cid,
        "sha256": sha,
        "document_is": document_is
        or empty_field_annotation(status="needs_review", provenance="unavailable"),
    }
    registry["content_records"].append(rec)
    return rec


def upsert_path_occurrence(
    registry: dict[str, Any],
    *,
    sha256: str,
    source_relative_path: str,
    parent_std: dict[str, Any] | None = None,
    filename_is_heuristic_value: str | None = None,
    queue_tags: list[str] | None = None,
    seed_notes: list[str] | None = None,
    path_status: str = "active",
    replaced_by_occurrence_id: str | None = None,
    replaces_occurrence_id: str | None = None,
) -> dict[str, Any]:
    sha = normalize_sha256(sha256)
    rel = normalize_rel_path(source_relative_path)
    upsert_content_record(registry, sha256=sha)
    oid = make_occurrence_id(sha256=sha, source_relative_path=rel)
    for occ in registry["path_occurrences"]:
        if occ.get("occurrence_id") == oid:
            if parent_std is not None:
                occ["parent_std"] = parent_std
            if queue_tags:
                occ["queue_tags"] = sorted(
                    set(list(occ.get("queue_tags") or []) + list(queue_tags))
                )
            if seed_notes:
                occ["seed_notes"] = list(occ.get("seed_notes") or []) + list(seed_notes)
            return occ
    # Ambiguous: another active occurrence with same path but different id/hash
    for occ in registry["path_occurrences"]:
        if (
            occ.get("path_status") == "active"
            and normalize_rel_path(str(occ.get("source_relative_path") or "")) == rel
            and occ.get("occurrence_id") != oid
        ):
            raise ReviewRegistryValidationError(
                f"ambiguous active path occurrence for {rel!r}: "
                f"{occ.get('occurrence_id')} vs {oid}"
            )
    folder, num = parent_std_from_path(rel)
    fname_is = filename_is_heuristic_value
    if fname_is is None:
        fname_is = filename_is_heuristic(rel)
    if parent_std is None:
        if folder:
            parent_std = empty_field_annotation(
                status="unverified",
                provenance="path_folder_heuristic",
                value=folder,
            )
            parent_std["number"] = num
        else:
            parent_std = empty_field_annotation(
                status="needs_review", provenance="unavailable", value=None
            )
            parent_std["number"] = None
    else:
        parent_std = dict(parent_std)
        if "number" not in parent_std:
            parent_std["number"] = num

    occ = {
        "occurrence_id": oid,
        "sha256": sha,
        "source_relative_path": rel,
        "path_status": path_status,
        "replaced_by_occurrence_id": replaced_by_occurrence_id,
        "replaces_occurrence_id": replaces_occurrence_id,
        "parent_std": parent_std,
        "filename_is_heuristic": fname_is,
        "queue_tags": list(queue_tags or []),
        "seed_notes": list(seed_notes or []),
    }
    registry["path_occurrences"].append(occ)
    return occ


def link_path_rename(
    registry: dict[str, Any],
    *,
    old_occurrence_id: str,
    new_source_relative_path: str,
    sha256: str | None = None,
) -> dict[str, Any]:
    """
    Record a path rename without dropping old annotations.

    Old occurrence → path_status=superseded; new active occurrence keeps same sha256.
    Parent STD may differ on the new path; Document IS stays on content record.
    """
    old = None
    for occ in registry["path_occurrences"]:
        if occ.get("occurrence_id") == old_occurrence_id:
            old = occ
            break
    _require(old is not None, f"unknown occurrence {old_occurrence_id}")
    assert old is not None
    sha = normalize_sha256(sha256 or old.get("sha256"))
    _require(sha == normalize_sha256(old.get("sha256")), "rename sha256 mismatch")
    new_occ = upsert_path_occurrence(
        registry,
        sha256=sha,
        source_relative_path=new_source_relative_path,
        parent_std=None,  # re-derive from new path (may differ)
        filename_is_heuristic_value=filename_is_heuristic(new_source_relative_path),
        queue_tags=list(old.get("queue_tags") or []) + ["path_rename"],
        seed_notes=[f"renamed_from:{old.get('source_relative_path')}"],
        path_status="active",
        replaces_occurrence_id=old_occurrence_id,
    )
    old["path_status"] = "superseded"
    old["replaced_by_occurrence_id"] = new_occ["occurrence_id"]
    registry["occurrence_links"].append(
        {
            "link_id": f"link_{uuid4().hex[:12]}",
            "from_occurrence_id": old_occurrence_id,
            "to_occurrence_id": new_occ["occurrence_id"],
            "relation": "renamed_to",
            "noted_at": _utc(),
        }
    )
    return new_occ


def rebuild_review_queue_and_summary(registry: dict[str, Any]) -> None:
    content_by_sha = {r["sha256"]: r for r in registry["content_records"]}
    queue: list[dict[str, Any]] = []
    summary = {
        "needs_review_document_is": 0,
        "needs_review_parent_std": 0,
        "unverified_document_is": 0,
        "unverified_parent_std": 0,
        "rejected_document_is": 0,
        "rejected_parent_std": 0,
        "folder_only_or_missing_document_is": 0,
        "filename_vs_parent_conflicts": 0,
        "queue_item_count": 0,
    }
    for occ in registry["path_occurrences"]:
        if occ.get("path_status") != "active":
            continue
        sha = occ["sha256"]
        crec = content_by_sha[sha]
        doc = crec.get("document_is") or {}
        parent = occ.get("parent_std") or {}
        reasons: list[str] = []
        if doc.get("status") == "needs_review":
            summary["needs_review_document_is"] += 1
            reasons.append("document_is_needs_review")
        if doc.get("status") == "unverified":
            summary["unverified_document_is"] += 1
            reasons.append("document_is_unverified")
        if doc.get("status") == "rejected":
            summary["rejected_document_is"] += 1
            reasons.append("document_is_rejected")
        if parent.get("status") == "needs_review":
            summary["needs_review_parent_std"] += 1
            reasons.append("parent_std_needs_review")
        if parent.get("status") == "unverified":
            summary["unverified_parent_std"] += 1
            reasons.append("parent_std_unverified")
        if parent.get("status") == "rejected":
            summary["rejected_parent_std"] += 1
            reasons.append("parent_std_rejected")
        if not doc.get("value"):
            summary["folder_only_or_missing_document_is"] += 1
            reasons.append("missing_document_is")
        fname = occ.get("filename_is_heuristic")
        parent_num = parent.get("number")
        if fname and parent_num:
            m = re.search(r"(\d+)", str(fname))
            if m and m.group(1) != str(parent_num):
                summary["filename_vs_parent_conflicts"] += 1
                reasons.append("filename_vs_parent_conflict")
        if reasons or occ.get("queue_tags"):
            queue.append(
                {
                    "occurrence_id": occ["occurrence_id"],
                    "sha256": sha,
                    "source_relative_path": occ["source_relative_path"],
                    "reasons": sorted(set(reasons)),
                    "queue_tags": list(occ.get("queue_tags") or []),
                    "document_is_status": doc.get("status"),
                    "parent_std_status": parent.get("status"),
                    "ui_hint": "Unverified / needs review",
                }
            )
    summary["queue_item_count"] = len(queue)
    registry["review_queue"] = queue
    registry["unresolved_summary"] = summary


def assert_safe_output_path(path: Path) -> None:
    if path.name in FORBIDDEN_OVERWRITE_NAMES:
        raise ReviewRegistryValidationError(
            f"refusing to write protected artifact name: {path.name}"
        )


def dump_registry(path: Path, registry: dict[str, Any]) -> None:
    assert_safe_output_path(path)
    if path.exists():
        raise ReviewRegistryValidationError(f"refusing overwrite existing file: {path.name}")
    validate_review_registry(registry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_registry(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    validate_review_registry(data)
    return data


def example_registry_dict() -> dict[str, Any]:
    """Synthetic schema example (no real corpus)."""
    sha_a = "a" * 64
    sha_b = "b" * 64
    reg = new_registry(notes=["synthetic example only"])
    upsert_content_record(
        reg,
        sha256=sha_a,
        document_is=empty_field_annotation(
            status="unverified",
            provenance="filename_heuristic",
            value="IS 2676",
        ),
    )
    # Same content bytes under two parent STD folders (cross-STD aliases)
    upsert_path_occurrence(
        reg,
        sha256=sha_a,
        source_relative_path="STD 21/Test Method/IS 2676 1981 - 00.pdf",
        queue_tags=["cross_std_test_method"],
    )
    upsert_path_occurrence(
        reg,
        sha256=sha_a,
        source_relative_path="STD 9999/Archive/IS 2676 1981 - 00.pdf",
        queue_tags=["cross_std_same_hash"],
        seed_notes=["same bytes, different parent STD context"],
    )
    upsert_content_record(
        reg,
        sha256=sha_b,
        document_is=empty_field_annotation(
            status="needs_review", provenance="unavailable", value=None
        ),
    )
    upsert_path_occurrence(
        reg,
        sha256=sha_b,
        source_relative_path="STD 1237/Master Documents/Test Report.pdf",
        queue_tags=["folder_only"],
    )
    # Rename: keep old occurrence annotations
    old_id = make_occurrence_id(
        sha256=sha_b, source_relative_path="STD 1237/Master Documents/Test Report.pdf"
    )
    link_path_rename(
        reg,
        old_occurrence_id=old_id,
        new_source_relative_path="STD 1237/Master Documents/Test Report (moved).pdf",
    )
    rebuild_review_queue_and_summary(reg)
    validate_review_registry(reg)
    return reg
