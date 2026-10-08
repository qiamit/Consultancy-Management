#!/usr/bin/env python3
"""
Planning-only second-pilot plan (no Chroma, no PDF, no indexing).

Writes a new versioned plan report. Does not modify selection or alias policy files.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.selection_validate import load_selection_json
from knowledge_engine.pilot.v2_plan import (
    V2PlanError,
    build_second_pilot_plan,
    load_v1_manifest_metadata,
    write_plan_report,
)


def _default_knowledge_index() -> Path:
    return Path.home() / "Library/Application Support/ConsultancyPro/knowledge-index"


def main(argv: list[str] | None = None) -> int:
    base = _default_knowledge_index()
    parser = argparse.ArgumentParser(
        description="Build second-pilot planning-only report (no Chroma/PDF/index)",
    )
    parser.add_argument(
        "--selection",
        type=Path,
        default=base / "diagnostics/pilot/pilot_selection_v2_selected.json",
    )
    parser.add_argument(
        "--existing-v1-selection",
        type=Path,
        default=base / "diagnostics/pilot/pilot_selection_v1_selected.json",
    )
    parser.add_argument(
        "--v1-manifest",
        type=Path,
        default=base / "sample_collections/bis_pilot_representative_v1/manifest.json",
        help="Read-only v1 path-keyed manifest (JSON only; no Chroma)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=base / "diagnostics/pilot/second_pilot_plan_v1.json",
        help="New versioned plan report path (must not overwrite selection files)",
    )
    args = parser.parse_args(argv)

    # Hard refuse clobbering selection / policy artifacts
    forbidden_names = {
        "pilot_selection_v2_selected.json",
        "pilot_selection_v1_selected.json",
        "alias_policy_v1.json",
        "alias_policy_v1_report.md",
        "pilot_selection_v2_report.md",
        "pilot_selection_v1_report.md",
    }
    if args.out.name in forbidden_names:
        print(f"ERROR: refusing to overwrite protected artifact name {args.out.name}", file=sys.stderr)
        return 2

    try:
        selection = load_selection_json(args.selection)
        v1_sel = load_selection_json(args.existing_v1_selection)
        v1_docs = load_v1_manifest_metadata(args.v1_manifest if args.v1_manifest.is_file() else None)
        plan = build_second_pilot_plan(
            selection=selection,
            existing_v1_selection=v1_sel,
            v1_manifest_docs=v1_docs,
        )
        out = write_plan_report(plan, args.out)
    except V2PlanError as exc:
        print(f"PLAN FAIL-CLOSED (before Chroma): {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"PLAN ERROR: {exc}", file=sys.stderr)
        return 1

    counts = plan["action_counts"]
    est = plan["unique_content_estimate_from_known_alias_groups_only"]
    print("mode=planning_only chroma_initialized=false pdf_reads=false indexing=false")
    print(f"wrote={out}")
    print(f"selection_path_count={plan['selection_path_count']}")
    print(f"alias_policy_groups={plan['alias_policy_group_count']}")
    print(f"alias_policy_aliased_paths={plan['alias_policy_aliased_paths']}")
    print(
        "unique_estimate_from_7_groups_only="
        f"{est['estimated_unique_if_only_these_7_groups_collapse']}"
    )
    print(f"action_counts={counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
