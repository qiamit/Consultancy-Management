"""Validate second-pilot selection JSON before any indexing (fail-closed)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    PILOT_SELECTION_ID,
    SECOND_PILOT_ADDITIONS_TARGET,
    SECOND_PILOT_COLLECTION_NAME,
    SECOND_PILOT_EXISTING_KEEP,
    SECOND_PILOT_SELECTION_ID,
    SECOND_PILOT_TARGET_TOTAL,
)


class SelectionValidationError(ValueError):
    """Raised when second-pilot selection fails hard checks."""


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise SelectionValidationError(msg)


def load_selection_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise SelectionValidationError(f"selection file missing: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SelectionValidationError(f"malformed selection JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise SelectionValidationError("selection root must be an object")
    return data


def validate_second_pilot_selection(
    data: dict[str, Any],
    *,
    existing_v1_selection: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Hard-fail validation for second-pilot indexing.

    Requires:
    - proposed_collection == bis_pilot_representative_v2
    - exactly 40 existing_pilot + 110 second_pilot_addition = 150
    - no missing relative_path, no duplicate paths
    - existing 40 paths match approved v1 selection when provided
    """
    proposed = data.get("proposed_collection")
    _require(
        proposed == SECOND_PILOT_COLLECTION_NAME,
        f"proposed_collection must be {SECOND_PILOT_COLLECTION_NAME!r}, got {proposed!r}",
    )
    _require(
        data.get("selection_id") in (None, SECOND_PILOT_SELECTION_ID)
        or data.get("selection_id") == SECOND_PILOT_SELECTION_ID,
        f"selection_id must be {SECOND_PILOT_SELECTION_ID!r}, got {data.get('selection_id')!r}",
    )

    selected = data.get("selected")
    _require(isinstance(selected, list), "selected must be a list")
    _require(
        len(selected) == SECOND_PILOT_TARGET_TOTAL,
        f"selected_count must be {SECOND_PILOT_TARGET_TOTAL}, got {len(selected)}",
    )

    existing: list[dict[str, Any]] = []
    additions: list[dict[str, Any]] = []
    paths: list[str] = []

    for i, row in enumerate(selected):
        _require(isinstance(row, dict), f"selected[{i}] must be an object")
        rel = row.get("relative_path")
        _require(isinstance(rel, str) and rel.strip(), f"selected[{i}] missing relative_path")
        rel = rel.replace("\\", "/").strip()
        paths.append(rel)
        wave = row.get("pilot_wave")
        if wave == "existing_pilot":
            existing.append(row)
        elif wave == "second_pilot_addition":
            additions.append(row)
        else:
            raise SelectionValidationError(
                f"selected[{i}] pilot_wave must be existing_pilot|second_pilot_addition, got {wave!r}"
            )

    _require(
        len(existing) == SECOND_PILOT_EXISTING_KEEP,
        f"existing_pilot count must be {SECOND_PILOT_EXISTING_KEEP}, got {len(existing)}",
    )
    _require(
        len(additions) == SECOND_PILOT_ADDITIONS_TARGET,
        f"second_pilot_addition count must be {SECOND_PILOT_ADDITIONS_TARGET}, got {len(additions)}",
    )
    _require(len(paths) == len(set(paths)), "duplicate relative_path in selection")

    if existing_v1_selection is not None:
        v1_sel = existing_v1_selection.get("selected") or []
        _require(
            len(v1_sel) == SECOND_PILOT_EXISTING_KEEP,
            f"existing v1 selection must have {SECOND_PILOT_EXISTING_KEEP} files, got {len(v1_sel)}",
        )
        v1_paths = {
            str(r.get("relative_path") or "").replace("\\", "/").strip() for r in v1_sel
        }
        ex_paths = {str(r.get("relative_path") or "").replace("\\", "/").strip() for r in existing}
        _require(
            ex_paths == v1_paths,
            "existing_pilot paths must exactly match approved first-pilot selection",
        )
        v1_col = existing_v1_selection.get("proposed_collection")
        _require(
            v1_col in (None, PILOT_COLLECTION_NAME),
            f"v1 selection collection unexpected: {v1_col!r}",
        )
        _require(
            existing_v1_selection.get("selection_id") in (None, PILOT_SELECTION_ID),
            f"v1 selection_id unexpected: {existing_v1_selection.get('selection_id')!r}",
        )

    # Refuse v1 collection target leakage
    _require(
        data.get("reuse_from_collection") in (None, PILOT_COLLECTION_NAME),
        f"reuse_from_collection must be {PILOT_COLLECTION_NAME!r} or omitted",
    )

    return {
        "ok": True,
        "proposed_collection": SECOND_PILOT_COLLECTION_NAME,
        "existing_count": len(existing),
        "additions_count": len(additions),
        "total": len(selected),
        "existing_paths": sorted(
            str(r.get("relative_path") or "").replace("\\", "/").strip() for r in existing
        ),
        "addition_paths": sorted(
            str(r.get("relative_path") or "").replace("\\", "/").strip() for r in additions
        ),
    }


def validate_second_pilot_selection_file(
    selection_path: Path,
    *,
    existing_v1_path: Path | None = None,
) -> dict[str, Any]:
    data = load_selection_json(selection_path)
    v1 = load_selection_json(existing_v1_path) if existing_v1_path else None
    return validate_second_pilot_selection(data, existing_v1_selection=v1)
