#!/usr/bin/env python3
"""
Second-pilot indexer for bis_pilot_representative_v2 ONLY.

Validates selection (40 existing + 110 additions = 150) and refuses to touch
protected collections. Does not accept v1-only options.

By default this script only validates — it will NOT index unless both
--i-understand-start-indexing and --execute-v2-index are passed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.pilot.collection_guards import (
    ProtectedCollectionError,
    assert_second_pilot_target,
)
from knowledge_engine.pilot.constants import (
    PILOT_COLLECTION_NAME,
    PROTECTED_COLLECTIONS,
    SECOND_PILOT_COLLECTION_NAME,
)
from knowledge_engine.pilot.alias_policy import (
    AliasPolicyError,
    require_alias_policy_ready,
)
from knowledge_engine.pilot.selection_validate import (
    SelectionValidationError,
    load_selection_json,
    validate_second_pilot_selection_file,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate / (optionally) index second-pilot corpus into v2 only",
    )
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument(
        "--existing-v1-selection",
        type=Path,
        required=True,
        help="Approved first-pilot selection JSON (read-only; must contain 40 files)",
    )
    parser.add_argument(
        "--collection",
        default=SECOND_PILOT_COLLECTION_NAME,
        help=f"Must be {SECOND_PILOT_COLLECTION_NAME}",
    )
    parser.add_argument(
        "--i-understand-start-indexing",
        action="store_true",
        help="Acknowledge indexing intent (still requires --execute-v2-index)",
    )
    parser.add_argument(
        "--execute-v2-index",
        action="store_true",
        help="Actually run indexing (requires --i-understand-start-indexing)",
    )
    parser.add_argument(
        "--dry-run-pipeline",
        action="store_true",
        help="Run mock reconcile path without PDF/Chroma (safe)",
    )
    parser.add_argument("--ocr-dpi", type=int, default=200)
    parser.add_argument("--target-40", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--pilot-v1", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.target_40 or args.pilot_v1:
        print(
            "ERROR: unsupported v1 options on second-pilot runner "
            "(--target-40 / --pilot-v1).",
            file=sys.stderr,
        )
        return 2

    try:
        assert_second_pilot_target(args.collection)
    except ProtectedCollectionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if args.collection in PROTECTED_COLLECTIONS or args.collection == PILOT_COLLECTION_NAME:
        print(
            f"ERROR: refusing protected/v1 collection target {args.collection!r}",
            file=sys.stderr,
        )
        return 2

    selection = args.selection.expanduser().resolve()
    existing = args.existing_v1_selection.expanduser().resolve()

    print(f"Selection (v2): {selection.name}")
    print(f"Existing v1 selection (read-only): {existing.name}")
    print(f"Target collection: {SECOND_PILOT_COLLECTION_NAME}")
    print(f"Protected (will not touch): {', '.join(sorted(PROTECTED_COLLECTIONS))}")

    try:
        summary = validate_second_pilot_selection_file(
            selection, existing_v1_path=existing
        )
    except SelectionValidationError as exc:
        print(f"VALIDATION FAIL: {exc}", file=sys.stderr)
        return 2

    print(
        "VALIDATION OK: "
        f"existing={summary['existing_count']} additions={summary['additions_count']} "
        f"total={summary['total']} collection={summary['proposed_collection']}"
    )

    try:
        sel_data = load_selection_json(selection)
        policy, records, units = require_alias_policy_ready(selection=sel_data)
        print(
            f"ALIAS POLICY OK: {policy.get('policy_id')} "
            f"groups={len(records)} extract_units={len(units)} "
            f"(selection rows preserved)"
        )
    except AliasPolicyError as exc:
        print(f"ALIAS POLICY FAIL: {exc}", file=sys.stderr)
        return 2

    if args.dry_run_pipeline:
        from knowledge_engine.pilot.v2_pipeline import (
            apply_v2_reconcile_actions,
            make_spy_adapters,
        )
        from knowledge_engine.pilot.source_reconcile import ScanEntry

        data = json.loads(selection.read_text(encoding="utf-8"))
        adapters = make_spy_adapters()
        scan = [
            ScanEntry(
                relative_path=str(r["relative_path"]),
                sha256=f"{i:064x}"[:64].ljust(64, "a"),
                file_size=r.get("size_bytes"),
            )
            for i, r in enumerate(data.get("selected") or [])
        ]
        scan = scan[:3]
        result = apply_v2_reconcile_actions(
            previous_documents={},
            scan=scan,
            adapters=adapters,
            dry_run=True,
        )
        print(
            f"DRY-RUN pipeline decisions={len(result.decisions)} "
            f"extract={adapters.spies.extract_calls} embed={adapters.spies.embed_calls}"
        )

    if not args.i_understand_start_indexing or not args.execute_v2_index:
        print(
            "Indexing NOT started. Validation only. "
            "To index after approval: pass both "
            "--i-understand-start-indexing and --execute-v2-index.",
            file=sys.stderr,
        )
        return 0

    # Dual execution gate satisfied — run live v2 indexing (fail-closed preflight inside).
    from knowledge_engine.config import load_settings
    from knowledge_engine.extract_pdf import default_diagnostics_dir
    from knowledge_engine.pilot.v2_live_index import V2LiveIndexError, run_second_pilot_indexing

    settings = load_settings()
    if settings.pdf_source_dir is None or settings.vector_db_path is None:
        print(
            "ERROR: KNOWLEDGE_PDF_SOURCE_DIR / KNOWLEDGE_VECTOR_DB_PATH required",
            file=sys.stderr,
        )
        return 2

    print(
        "EXECUTION GATE OK: starting live index into "
        f"{SECOND_PILOT_COLLECTION_NAME} only (OCR+embed enabled).",
        flush=True,
    )
    try:
        metrics = run_second_pilot_indexing(
            selection_path=selection,
            existing_v1_selection_path=existing,
            pdf_source_dir=settings.pdf_source_dir,
            vector_db_path=settings.vector_db_path,
            diagnostics_root=default_diagnostics_dir(settings),
            ocr_dpi=args.ocr_dpi,
        )
    except V2LiveIndexError as exc:
        print(f"LIVE INDEX PREFLIGHT/FAIL-CLOSED: {exc}", file=sys.stderr)
        return 3
    except ProtectedCollectionError as exc:
        print(f"PROTECTED COLLECTION BLOCK: {exc}", file=sys.stderr)
        return 3

    print("=== Second-pilot v2 indexing finished ===")
    print(f"collection={metrics.get('collection')}")
    print(f"collection_count={metrics.get('collection_count')}")
    print(f"manifest_document_count={metrics.get('manifest_document_count')}")
    print(f"unique_content_units={metrics.get('unique_content_units')}")
    print(f"selection_path_count={metrics.get('selection_path_count')}")
    print(
        f"reused_units={metrics.get('content_units_reused')} "
        f"new_extract_units={metrics.get('content_units_new_extract')} "
        f"alias_extra_slots={metrics.get('alias_extra_path_slots')}"
    )
    print(
        f"processed_ok={metrics.get('processed_ok')} failed={metrics.get('failed')} "
        f"skipped={metrics.get('skipped_unchanged')}"
    )
    print(
        f"usable_chunks={metrics.get('usable_chunks_sum')} "
        f"needs_review={metrics.get('needs_review_chunks_sum')}"
    )
    print(
        f"native_pages={metrics.get('native_pages_sum')} "
        f"ocr_pages={metrics.get('ocr_pages_sum')} "
        f"extract_calls={metrics.get('extract_calls_total')}"
    )
    print(f"wall_seconds={metrics.get('wall_seconds')}")
    print(f"protected_untouched={metrics.get('protected_collections_untouched')}")
    print(f"source_pdfs_modified={metrics.get('source_pdfs_modified')}")
    out = (
        settings.vector_db_path
        / "sample_collections"
        / SECOND_PILOT_COLLECTION_NAME
        / "metrics.json"
    )
    print(f"metrics={out.name}")
    return 0 if int(metrics.get("failed") or 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
