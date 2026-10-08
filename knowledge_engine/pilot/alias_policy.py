"""
Second-pilot approved alias / dedup policy (versioned JSON).

Does not mutate v1 collections or rewrite the 150-row selection file.
Live indexing still requires separate approval gates.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from knowledge_engine.pilot.constants import SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.pilot.document_identity import (
    document_id_from_sha256,
    normalize_rel_path,
    sample_label_for_content,
    short_document_token,
)

Decision = Literal["A", "B"]

POLICY_FILENAME = "alias_policy_v1.json"
DEFAULT_POLICY_PATH = Path(__file__).resolve().parent / POLICY_FILENAME


class AliasPolicyError(ValueError):
    """Fail-closed alias policy validation / application error."""


@dataclass
class AliasPathRecord:
    relative_path: str
    filename: str
    std_folder_from_path: str | None
    decision: Decision
    sha256: str
    document_id: str
    shared_chunk_id_prefix: str
    is_number_heuristic: str | None
    is_number_verified: bool
    metadata_status: str
    path_std_context: str | None
    quality_review_status: str | None = None
    quality_classification: str | None = None
    role: str = "alias"  # canonical | alias | path_record_b


@dataclass
class ContentIdentityRecord:
    sha256: str
    document_id: str
    shared_chunk_id_prefix: str
    decision: Decision
    group_id: str
    source_aliases: list[str]
    path_records: list[AliasPathRecord]
    v1_reuse_candidate_path: str | None
    v1_alias_only_paths: list[str] = field(default_factory=list)
    is_number_heuristic: str | None = None
    is_number_verified: bool = False
    quality_review_status: str | None = None
    quality_classification: str | None = None
    forbid_folder_inferred_is_number: bool = False

    @property
    def extraction_once(self) -> bool:
        return True  # exact bytes → one extraction/chunk identity


def default_policy_path() -> Path:
    return DEFAULT_POLICY_PATH


def load_alias_policy(path: Path | None = None) -> dict[str, Any]:
    p = path or default_policy_path()
    if not p.is_file():
        raise AliasPolicyError(f"alias policy file missing: {p.name}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AliasPolicyError(f"alias policy malformed JSON: {exc}") from exc
    if not isinstance(data, dict) or not data.get("groups"):
        raise AliasPolicyError("alias policy missing groups")
    if data.get("proposed_collection") not in (None, SECOND_PILOT_COLLECTION_NAME):
        raise AliasPolicyError(
            f"alias policy collection mismatch: {data.get('proposed_collection')!r}"
        )
    return data


def _std_folder(rel: str) -> str | None:
    parts = Path(normalize_rel_path(rel)).parts
    return parts[0] if parts else None


def validate_alias_policy_against_selection(
    policy: dict[str, Any],
    *,
    selection: dict[str, Any],
    observed_hashes_by_path: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Fail-closed checks:
    - every policy path exists in selection
    - no path claimed by two groups
    - decision in {A,B}
    - optional observed SHA-256 must match policy sha256 per path
    - selection path rows remain intact (150) — policy must not require deletion
    """
    selected = selection.get("selected") or []
    sel_paths = {
        normalize_rel_path(str(r.get("relative_path") or ""))
        for r in selected
        if r.get("relative_path")
    }
    path_owner: dict[str, str] = {}
    hash_owner: dict[str, str] = {}
    groups_out: list[dict[str, Any]] = []

    for g in policy.get("groups") or []:
        gid = g.get("group_id") or "?"
        decision = g.get("decision")
        if decision not in ("A", "B"):
            raise AliasPolicyError(f"{gid}: decision must be A or B, got {decision!r}")
        sha = (g.get("sha256") or "").strip().lower()
        if len(sha) != 64:
            raise AliasPolicyError(f"{gid}: invalid sha256")
        paths = [normalize_rel_path(p) for p in (g.get("paths") or [])]
        if len(paths) < 2:
            raise AliasPolicyError(f"{gid}: need >=2 paths")
        if len(paths) != len(set(paths)):
            raise AliasPolicyError(f"{gid}: duplicate paths inside group")
        for rel in paths:
            if rel not in sel_paths:
                raise AliasPolicyError(f"{gid}: path not in selection: {rel}")
            if rel in path_owner:
                raise AliasPolicyError(
                    f"duplicate mapping conflict: {rel} in {path_owner[rel]} and {gid}"
                )
            path_owner[rel] = gid
            if observed_hashes_by_path is not None:
                obs = (observed_hashes_by_path.get(rel) or "").lower()
                if not obs:
                    raise AliasPolicyError(f"{gid}: missing observed hash for {rel}")
                if obs != sha:
                    raise AliasPolicyError(
                        f"{gid}: hash/path mismatch for {rel}: "
                        f"policy={sha[:16]}… observed={obs[:16]}…"
                    )
        if sha in hash_owner:
            raise AliasPolicyError(
                f"duplicate mapping conflict: sha {sha[:16]}… in {hash_owner[sha]} and {gid}"
            )
        hash_owner[sha] = gid

        # Prefix must match content token
        prefix = (g.get("v2_content_mapping") or {}).get("shared_chunk_id_prefix") or ""
        expected_prefix = f"doc_{short_document_token(sha)}"
        if prefix and prefix != expected_prefix:
            raise AliasPolicyError(
                f"{gid}: shared_chunk_id_prefix {prefix!r} != {expected_prefix!r}"
            )

        is_pol = g.get("is_number_policy") or {}
        if is_pol.get("use_as_verified_filter") is True:
            raise AliasPolicyError(f"{gid}: heuristic is_number must not be verified filter")
        if gid.startswith("g5") and is_pol.get("value_from_filename_heuristic") not in (None,):
            raise AliasPolicyError("g5 must keep is_number null/unverified")

        q = g.get("quality_override") or {}
        if gid.startswith("g6"):
            if q.get("forced_selection_classification") != "suspect":
                raise AliasPolicyError("g6 must force suspect classification")
            if q.get("forced_review_status") not in ("needs_review", "suspect"):
                raise AliasPolicyError("g6 must force non-usable review status")

        groups_out.append({"group_id": gid, "decision": decision, "paths": paths, "sha256": sha})

    return {
        "ok": True,
        "group_count": len(groups_out),
        "aliased_path_count": len(path_owner),
        "selection_path_count": len(sel_paths),
        "selection_rows_preserved": True,
        "groups": groups_out,
    }


def build_content_identity_records(policy: dict[str, Any]) -> list[ContentIdentityRecord]:
    records: list[ContentIdentityRecord] = []
    for g in policy.get("groups") or []:
        sha = (g.get("sha256") or "").lower()
        decision: Decision = g["decision"]
        paths = [normalize_rel_path(p) for p in g["paths"]]
        did = document_id_from_sha256(sha)
        prefix = f"doc_{short_document_token(sha)}"
        is_pol = g.get("is_number_policy") or {}
        q = g.get("quality_override") or {}
        v1_sets = g.get("v1_path_keyed_chunk_sets") or []
        reuse = next(
            (x.get("source_relative_path") for x in v1_sets if x.get("role") == "candidate_reuse_source"),
            None,
        )
        alias_only = [
            normalize_rel_path(x["source_relative_path"])
            for x in v1_sets
            if x.get("role") == "alias_only_do_not_second_upsert"
        ]

        sugg = normalize_rel_path(g["canonical_path_suggestion"]) if g.get("canonical_path_suggestion") else None
        path_records: list[AliasPathRecord] = []
        for i, rel in enumerate(paths):
            if decision == "A":
                if sugg:
                    role = "canonical" if rel == sugg else "alias"
                else:
                    role = "canonical" if i == 0 else "alias"
            else:
                role = "path_record_b"
            path_records.append(
                AliasPathRecord(
                    relative_path=rel,
                    filename=Path(rel).name,
                    std_folder_from_path=_std_folder(rel),
                    decision=decision,
                    sha256=sha,
                    document_id=did,
                    shared_chunk_id_prefix=prefix,
                    is_number_heuristic=is_pol.get("value_from_filename_heuristic"),
                    is_number_verified=False,
                    metadata_status=is_pol.get("metadata_status") or "filename_heuristic_unverified",
                    path_std_context=_std_folder(rel),
                    quality_review_status=q.get("forced_review_status"),
                    quality_classification=q.get("forced_selection_classification"),
                    role=role,
                )
            )
        # Ensure exactly one canonical for A
        if decision == "A":
            cans = [p for p in path_records if p.role == "canonical"]
            if not cans:
                path_records[0].role = "canonical"
            elif len(cans) > 1:
                for p in cans[1:]:
                    p.role = "alias"

        records.append(
            ContentIdentityRecord(
                sha256=sha,
                document_id=did,
                shared_chunk_id_prefix=prefix,
                decision=decision,
                group_id=g["group_id"],
                source_aliases=list(paths),
                path_records=path_records,
                v1_reuse_candidate_path=normalize_rel_path(reuse) if reuse else None,
                v1_alias_only_paths=alias_only,
                is_number_heuristic=is_pol.get("value_from_filename_heuristic"),
                is_number_verified=False,
                quality_review_status=q.get("forced_review_status"),
                quality_classification=q.get("forced_selection_classification"),
                forbid_folder_inferred_is_number=bool(is_pol.get("forbid_folder_inferred_is_number")),
            )
        )
    return records


def plan_indexing_units(records: list[ContentIdentityRecord]) -> list[dict[str, Any]]:
    """
    One extraction/embed unit per content hash.
    Returns units suitable for dry-run / fail-closed planning (no IO).
    """
    units: list[dict[str, Any]] = []
    for rec in records:
        units.append(
            {
                "group_id": rec.group_id,
                "decision": rec.decision,
                "sha256": rec.sha256,
                "document_id": rec.document_id,
                "shared_chunk_id_prefix": rec.shared_chunk_id_prefix,
                "extract_once": True,
                "embed_once": True,
                "source_aliases": list(rec.source_aliases),
                "path_records": [
                    {
                        "relative_path": p.relative_path,
                        "role": p.role,
                        "path_std_context": p.path_std_context,
                        "is_number_heuristic": p.is_number_heuristic,
                        "is_number_verified": False,
                        "metadata_status": p.metadata_status,
                    }
                    for p in rec.path_records
                ],
                "v1_reuse_candidate_path": rec.v1_reuse_candidate_path,
                "v1_alias_only_paths": list(rec.v1_alias_only_paths),
                "quality_review_status": rec.quality_review_status,
                "quality_classification": rec.quality_classification,
                "forbid_folder_inferred_is_number": rec.forbid_folder_inferred_is_number,
                "sample_label": sample_label_for_content(rec.sha256),
            }
        )
    return units


def assert_no_v1_writes(collection_name: str | None) -> None:
    from knowledge_engine.pilot.collection_guards import (
        ProtectedCollectionError,
        is_protected_collection,
    )
    from knowledge_engine.pilot.constants import PILOT_COLLECTION_NAME

    if collection_name == PILOT_COLLECTION_NAME or is_protected_collection(collection_name):
        raise ProtectedCollectionError(
            f"alias policy must not write protected/v1 collection {collection_name!r}"
        )


def _enrich_hit_with_alias_policy(
    hit: dict[str, Any],
    *,
    sha: str,
    by_sha: dict[str, ContentIdentityRecord],
) -> dict[str, Any]:
    enriched = dict(hit)
    if not sha or sha not in by_sha:
        return enriched
    rec = by_sha[sha]
    enriched["content_document_id"] = rec.document_id
    enriched["source_aliases"] = list(rec.source_aliases)
    enriched["alias_decision"] = rec.decision
    enriched["path_std_contexts"] = {
        p.relative_path: p.path_std_context for p in rec.path_records
    }
    enriched["is_number_verified"] = False
    enriched["is_number_metadata_status"] = (
        "filename_heuristic_unverified" if rec.is_number_heuristic else "unverified_null"
    )
    if rec.forbid_folder_inferred_is_number:
        if not enriched.get("is_number"):
            enriched["is_number"] = None
        enriched["is_number_metadata_status"] = "unverified_null"
    if rec.quality_review_status:
        enriched["review_status"] = rec.quality_review_status
    if rec.quality_classification == "suspect" and enriched.get("review_status") == "usable":
        enriched["review_status"] = "needs_review"
    return enriched


def dedupe_search_hits_by_content(
    hits: list[dict[str, Any]],
    *,
    alias_records: list[ContentIdentityRecord] | None = None,
) -> list[dict[str, Any]]:
    """
    Suppress only alias-equivalent duplicate hits (same shared chunk_id).

    - Same chunk_id from multiple alias paths → keep once; attach all source_aliases.
    - Sibling chunks (same document SHA, different page/ordinal/chunk_id) → ALL kept.
    - Different documents with similar/identical text → BOTH kept.
    Never collapse by document SHA / text SHA alone.
    """
    by_sha = {r.sha256: r for r in (alias_records or [])}
    path_to_sha = {
        p.relative_path: r.sha256 for r in (alias_records or []) for p in r.path_records
    }

    seen_chunk: set[str] = set()
    out: list[dict[str, Any]] = []

    for h in hits:
        cid = (h.get("chunk_id") or "").strip()
        rel = normalize_rel_path(str(h.get("source_relative_path") or ""))
        sha = (h.get("source_file_hash") or h.get("sha256") or path_to_sha.get(rel) or "").lower()

        # Alias-equivalent: identical shared chunk identity only
        if cid and cid in seen_chunk:
            continue

        enriched = _enrich_hit_with_alias_policy(h, sha=sha, by_sha=by_sha)
        if cid:
            seen_chunk.add(cid)
        out.append(enriched)
    return out


def require_alias_policy_ready(
    *,
    selection: dict[str, Any],
    policy_path: Path | None = None,
    observed_hashes_by_path: dict[str, str] | None = None,
) -> tuple[dict[str, Any], list[ContentIdentityRecord], list[dict[str, Any]]]:
    """Load + validate policy; fail-closed. Used by v2 dry-run / future index gate."""
    policy = load_alias_policy(policy_path)
    validate_alias_policy_against_selection(
        policy,
        selection=selection,
        observed_hashes_by_path=observed_hashes_by_path,
    )
    records = build_content_identity_records(policy)
    units = plan_indexing_units(records)
    return policy, records, units


def try_load_alias_records_for_search(
    policy_path: Path | None = None,
) -> list[ContentIdentityRecord] | None:
    """
    Soft-load for search enrichment. Missing/invalid policy → None (no crash).
    Does not open Chroma or PDFs.
    """
    try:
        policy = load_alias_policy(policy_path)
        return build_content_identity_records(policy)
    except AliasPolicyError:
        return None
    except OSError:
        return None
