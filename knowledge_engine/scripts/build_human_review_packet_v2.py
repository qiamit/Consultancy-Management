#!/usr/bin/env python3
"""
Build a versioned human-review packet for v2 standard-filter / gold proposals.

Uses ONLY existing diagnostics + v2 chunk JSON artifacts + selection metadata.
No Chroma client, no PDF reads, no live filter changes, no gold overwrite.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.pilot.standard_filter_v2_candidate import (
    resolve_standard_identity_v2_candidate,
)

FORBIDDEN_OUT = {
    "reliability_eval_v1.json",
    "pilot_eval_v1.json",
    "alias_policy_v1.json",
    "pilot_selection_v2_selected.json",
    "post_v2_retrieval_validation_v1.json",
    "post_v2_answerability_diagnosis_v1.json",
    "standard_filter_v2_candidate_eval_v1.json",
    "proposed_unverified_gold_v2_plus20_v1.json",
    "manifest.json",
    "metrics.json",
}


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parent_std_context(rel: str) -> dict[str, Any]:
    rel_n = (rel or "").replace("\\", "/").strip()
    parts = Path(rel_n).parts
    folder = parts[0] if parts else None
    m = re.match(r"^STD\s+(\d+)\b", folder or "", re.I)
    return {
        "parent_STD_context": folder,
        "parent_STD_number": m.group(1) if m else None,
        "field_role": "product_or_parent_folder_context_only",
        "not_document_is_number": True,
    }


def _load_chunk_index(chunks_dir: Path) -> dict[str, dict[str, Any]]:
    """chunk_id → {text, clause, pages, review_status, path, sample_label}"""
    by_id: dict[str, dict[str, Any]] = {}
    if not chunks_dir.is_dir():
        return by_id
    for path in chunks_dir.glob("*__chunks.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rel = data.get("source_relative_path")
        sample = data.get("sample_label")
        for ch in data.get("chunks") or []:
            cid = ch.get("chunk_id")
            if not cid:
                continue
            by_id[cid] = {
                "chunk_id": cid,
                "clause_number": ch.get("clause_number"),
                "pdf_pages": list(ch.get("pdf_pages") or []),
                "review_status": ch.get("review_status"),
                "source_relative_path": ch.get("source_relative_path") or rel,
                "sample_label": sample,
                "text_excerpt": " ".join((ch.get("text") or "").split())[:280],
                "source_file_hash": ch.get("source_file_hash") or data.get("source_file_hash_sha256"),
            }
    return by_id


def _evidence_for_case(
    case: dict[str, Any],
    by_chunk: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    """Prefer top1 chunk_id from diagnosis; else expect_chunk_id suffix match."""
    top1 = (case.get("score_components_top1") or {}) if "score_components_top1" in case else {}
    # diagnosis uses score_components_top1; candidate eval uses identity/path
    cid = None
    if isinstance(case.get("top1"), dict):
        cid = case["top1"].get("chunk_id")
    if not cid:
        cid = top1.get("chunk_id")
    if cid and cid in by_chunk:
        return by_chunk[cid]
    expect = case.get("expect_chunk_id") or ""
    m = re.search(r"(:p\d+:c\d+)$", expect, re.I)
    if m:
        suffix = m.group(1)
        for k, v in by_chunk.items():
            if k.endswith(suffix) and "9666" in (v.get("source_relative_path") or ""):
                return v
            if k.endswith(suffix) and "2676" in (v.get("source_relative_path") or ""):
                return v
    # fallback: path from top1
    rel = top1.get("source_relative_path") or (case.get("top1") or {}).get("source_relative_path")
    if rel:
        for v in by_chunk.values():
            if v.get("source_relative_path") == rel:
                return v
    return None


def _identity_row(rel: str, evidence: dict[str, Any] | None) -> dict[str, Any]:
    hit = {
        "source_relative_path": rel,
        "is_number": "",  # v2 chunk artifacts do not store verified is_number in bundles
        "sample_label": (evidence or {}).get("sample_label") or "",
    }
    ident = resolve_standard_identity_v2_candidate(hit)
    parent = _parent_std_context(rel)
    fname_is = ident.filename_is_token
    # Explicit separation: never call filename match "verified"
    status = {
        "verified_metadata": "verified",
        "legacy_sample_label": "verified_legacy_baseline_label",
        "filename_heuristic_unverified": "heuristic",
        "review_required": "ambiguous_needs_human_review",
        "unknown": "needs_human_review",
    }.get(ident.confidence, "needs_human_review")

    conflict = False
    if fname_is and parent.get("parent_STD_number"):
        if fname_is.replace("IS ", "") != str(parent["parent_STD_number"]):
            conflict = True

    return {
        "document_is_number_filename_heuristic": fname_is,
        "document_is_number_status": (
            "heuristic_unverified" if fname_is else "absent"
        ),
        "document_is_number_NOT_verified": True if fname_is else True,
        "parent_STD_context": parent["parent_STD_context"],
        "parent_STD_number": parent["parent_STD_number"],
        "parent_STD_context_status": "path_folder_context_only",
        "fields_are_separate": True,
        "filename_vs_parent_conflict": conflict,
        "resolver_confidence": ident.confidence,
        "provenance": list(ident.provenance),
        "review_status_label": status,
        "notes": list(ident.notes),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build v2 human-review packet (offline)")
    parser.add_argument("--out-json", type=Path, default=None)
    parser.add_argument("--out-md", type=Path, default=None)
    args = parser.parse_args(argv)

    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2

    diag_dir = settings.vector_db_path / "diagnostics" / "pilot"
    v2_root = settings.vector_db_path / "sample_collections" / "bis_pilot_representative_v2"
    out_json = args.out_json or (diag_dir / "human_review_packet_v2_standard_filter_v1.json")
    out_md = args.out_md or (diag_dir / "human_review_packet_v2_standard_filter_v1.md")

    for p in (out_json, out_md):
        if p.name in FORBIDDEN_OUT:
            print(f"ERROR: refusing protected name {p.name}", file=sys.stderr)
            return 2
        if p.exists():
            print(f"ERROR: exists {p.name}", file=sys.stderr)
            return 2

    # Required inputs (existing artifacts only)
    diagnosis_path = diag_dir / "post_v2_answerability_diagnosis_v1.json"
    candidate_eval_path = diag_dir / "standard_filter_v2_candidate_eval_v1.json"
    proposed_path = diag_dir / "proposed_unverified_gold_v2_plus20_v1.json"
    selection_path = diag_dir / "pilot_selection_v2_selected.json"

    for req in (diagnosis_path, candidate_eval_path, proposed_path, selection_path):
        if not req.is_file():
            print(f"ERROR: missing required artifact {req.name}", file=sys.stderr)
            return 2

    diagnosis = json.loads(diagnosis_path.read_text(encoding="utf-8"))
    cand_eval = json.loads(candidate_eval_path.read_text(encoding="utf-8"))
    proposed = json.loads(proposed_path.read_text(encoding="utf-8"))
    selection = json.loads(selection_path.read_text(encoding="utf-8"))

    by_chunk = _load_chunk_index(v2_root / "chunks")
    # also index needs_review bundles for completeness (read-only)
    by_chunk.update(_load_chunk_index(v2_root / "needs_review_chunks"))

    sel_by_path = {
        str(r.get("relative_path") or "").replace("\\", "/"): r
        for r in (selection.get("selected") or [])
    }

    # --- Section 1: evaluation cases with separated identity fields ---
    case_rows: list[dict[str, Any]] = []
    fn_rows: list[dict[str, Any]] = []

    for case in diagnosis.get("case_level") or []:
        top1 = case.get("score_components_top1") or {}
        rel = top1.get("source_relative_path") or ""
        evidence = _evidence_for_case(case, by_chunk)
        if evidence and not rel:
            rel = evidence.get("source_relative_path") or ""
        identity = _identity_row(rel, evidence)
        sel = sel_by_path.get(rel) or {}
        row = {
            "case_id": case.get("id"),
            "suite": "reliability_eval_v1",
            "query": case.get("query"),
            "gold_label": case.get("gold_label"),
            "selected_standard_filter": case.get("standard"),
            "retrieval_gold_rank": case.get("retrieval_gold_rank"),
            "answerability_state_live": case.get("answerability_state"),
            "failure_layer": case.get("failure_layer"),
            "evidence_reasons_live": case.get("evidence_reasons"),
            # SEPARATE fields — do not merge
            "document_is_number": identity["document_is_number_filename_heuristic"],
            "document_is_number_provenance": "filename_IS_token_heuristic_unverified"
            if identity["document_is_number_filename_heuristic"]
            else None,
            "document_is_number_verified": False,
            "parent_STD_context": identity["parent_STD_context"],
            "parent_STD_number": identity["parent_STD_number"],
            "parent_STD_context_provenance": "source_relative_path_folder",
            "filename_vs_parent_STD_conflict": identity["filename_vs_parent_conflict"],
            "identity_review_status": identity["review_status_label"],
            "resolver_confidence": identity["resolver_confidence"],
            "resolver_provenance": identity["provenance"],
            "indexed_evidence": {
                "chunk_id": (evidence or {}).get("chunk_id") or top1.get("chunk_id"),
                "clause_number": (evidence or {}).get("clause_number") or top1.get("clause_number"),
                "pdf_pages": (evidence or {}).get("pdf_pages"),
                "review_status": (evidence or {}).get("review_status") or "usable",
                "text_excerpt": (evidence or {}).get("text_excerpt"),
                "source_relative_path": rel,
            },
            "selection_meta": {
                "pilot_wave": sel.get("pilot_wave"),
                "classification": sel.get("classification"),
                "folder_context": sel.get("folder_context"),
                "is_number_from_name_selection": sel.get("is_number_from_name"),
                "note": "selection is_number_from_name is also heuristic — not verified metadata",
            },
        }
        case_rows.append(row)
        if case.get("failure_layer") == "answerability_gate_standard_filter" or (
            case.get("retrieval_gold_rank") == 1
            and case.get("answerability_state") == "not_found"
            and case.get("gold_label") != "NOT_FOUND"
        ):
            fn_rows.append(row)

    # Enrich FN list exactly from diagnosis FN group if needed
    fn_ids = set()
    for ids in (diagnosis.get("fn_grouped_by_evidence_reasons") or {}).values():
        fn_ids.update(ids)
    if fn_ids:
        fn_rows = [r for r in case_rows if r["case_id"] in fn_ids]

    # Pilot cases from candidate eval (live mode rows) + pilot_eval_v1 expect ids
    pilot_live = (
        cand_eval.get("suites", {})
        .get("live", {})
        .get("pilot_eval_v1", {})
        .get("cases")
        or []
    )
    pilot_eval = json.loads(
        (Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json").read_text(
            encoding="utf-8"
        )
    )
    pilot_by_id = {c["id"]: c for c in pilot_live}
    pilot_rows: list[dict[str, Any]] = []
    for case in list(pilot_eval.get("answerable") or []) + list(pilot_eval.get("unanswerable") or []):
        cid = case["id"]
        live = pilot_by_id.get(cid) or {}
        # Find evidence via expect_chunk_id in chunk index
        evidence = None
        expect = case.get("expect_chunk_id") or ""
        m = re.search(r"(:p\d+:c\d+)$", expect, re.I)
        if m:
            suffix = m.group(1)
            for k, v in by_chunk.items():
                if k.endswith(suffix):
                    # prefer 9666/2676 baselines for pilot suite
                    evidence = v
                    if "9666" in (v.get("source_relative_path") or "") or "2676" in (
                        v.get("source_relative_path") or ""
                    ):
                        break
        rel = (evidence or {}).get("source_relative_path") or ""
        identity = _identity_row(rel, evidence)
        sel = sel_by_path.get(rel) or {}
        pilot_rows.append(
            {
                "case_id": cid,
                "suite": "pilot_eval_v1",
                "query": case.get("query"),
                "gold_label": case.get("gold_label"),
                "selected_standard_filter": case.get("standard"),
                "retrieval_gold_rank": live.get("retrieval_gold_rank"),
                "answerability_state_live": live.get("answerability_state"),
                "document_is_number": identity["document_is_number_filename_heuristic"],
                "document_is_number_verified": False,
                "document_is_number_provenance": "filename_IS_token_heuristic_unverified"
                if identity["document_is_number_filename_heuristic"]
                else None,
                "parent_STD_context": identity["parent_STD_context"],
                "parent_STD_number": identity["parent_STD_number"],
                "filename_vs_parent_STD_conflict": identity["filename_vs_parent_conflict"],
                "identity_review_status": identity["review_status_label"],
                "indexed_evidence": {
                    "chunk_id": (evidence or {}).get("chunk_id"),
                    "clause_number": (evidence or {}).get("clause_number") or case.get("expect_clause"),
                    "pdf_pages": (evidence or {}).get("pdf_pages"),
                    "review_status": (evidence or {}).get("review_status"),
                    "text_excerpt": (evidence or {}).get("text_excerpt"),
                    "source_relative_path": rel,
                },
                "selection_meta": {
                    "pilot_wave": sel.get("pilot_wave"),
                    "classification": sel.get("classification"),
                },
            }
        )

    # --- Section 2: 20 proposed unverified ---
    proposed_table = []
    for c in proposed.get("candidates") or []:
        ev = c.get("evidence_reference") or {}
        cid = ev.get("chunk_id")
        evidence = by_chunk.get(cid or "") if cid else None
        rel = ev.get("source_relative_path") or (evidence or {}).get("source_relative_path") or ""
        identity = _identity_row(rel, evidence)
        # proposed answer is excerpt only, labeled proposed_unverified — NOT gold
        proposed_answer = {
            "label": "proposed_unverified",
            "draft_excerpt_only": (evidence or {}).get("text_excerpt") or ev.get("text_preview"),
            "not_an_expected_answer": True,
            "not_authoritative_gold": True,
        }
        proposed_table.append(
            {
                "proposed_id": c.get("proposed_id"),
                "status": c.get("status") or "proposed_unverified",
                "human_review": c.get("human_review") or "pending",
                "query": c.get("query"),
                "lang_guess": c.get("lang_guess"),
                "source_relative_path": rel,
                "document_is_number": identity["document_is_number_filename_heuristic"],
                "document_is_number_verified": False,
                "parent_STD_context": identity["parent_STD_context"],
                "filename_vs_parent_STD_conflict": identity["filename_vs_parent_conflict"],
                "evidence_chunk_id": cid or (evidence or {}).get("chunk_id"),
                "evidence_clause": ev.get("clause_number") or (evidence or {}).get("clause_number"),
                "evidence_pages": (evidence or {}).get("pdf_pages"),
                "evidence_review_status": (evidence or {}).get("review_status"),
                "evidence_excerpt": (evidence or {}).get("text_excerpt") or ev.get("text_preview"),
                "proposed_answer": proposed_answer,
                "expected_answer": None,
                "gold_label": None,
                "authoritative_eval_added": False,
            }
        )

    # --- Section 3: UI filter recommendation (no implementation) ---
    cross_examples = []
    for rel, row in sel_by_path.items():
        identity = _identity_row(rel, None)
        if identity["filename_vs_parent_conflict"] and identity["document_is_number_filename_heuristic"]:
            folder_ctx = row.get("folder_context") or ""
            cross_examples.append(
                {
                    "source_relative_path": rel,
                    "document_is_number_filename_heuristic": identity[
                        "document_is_number_filename_heuristic"
                    ],
                    "parent_STD_context": identity["parent_STD_context"],
                    "folder_context_selection": folder_ctx,
                    "why": "Filename IS ≠ parent STD folder number (typical Test Method case).",
                }
            )
        if len(cross_examples) >= 8:
            break

    ui_recommendation = {
        "recommendation": "show_both_as_separate_filters",
        "rationale": [
            "PDF document IS number (from verified metadata preferred; filename heuristic only until verified) answers 'which IS text is this?'.",
            "Parent/product STD context answers 'which product/STD folder does this file live under?' — often different for Test Method PDFs.",
            "Merging them into one filter hides cross-STD method reuse and creates false matches.",
        ],
        "suggested_ui_labels": {
            "document_is_number": "Document IS (PDF)",
            "parent_STD_context": "Parent / product STD folder",
        },
        "do_not": [
            "Do not treat STD folder number as the PDF's IS number.",
            "Do not mark filename IS token as verified without human confirmation.",
        ],
        "cross_std_test_method_examples": cross_examples,
        "live_filter_implementation": False,
    }

    # --- Section 4: shadow comparison (from existing candidate eval — no retune) ---
    shadow_comparison = {
        "source_report": candidate_eval_path.name,
        "live_thresholds_changed": False,
        "candidate_promoted_to_live": False,
        "reliability": cand_eval.get("comparison", {}).get("reliability"),
        "pilot": cand_eval.get("comparison", {}).get("pilot"),
        "note": (
            "Shadow-only. candidate_v2 clears standard_filter_mismatch FNs on this 60-case set; "
            "do not promote without broader review of filename heuristic + gold."
        ),
    }

    ambiguous = [
        r
        for r in case_rows + pilot_rows
        if r.get("filename_vs_parent_STD_conflict")
        or r.get("identity_review_status") in ("ambiguous_needs_human_review", "needs_human_review")
        or (
            r.get("document_is_number")
            and r.get("parent_STD_number")
            and str(r.get("document_is_number")).replace("IS ", "") != str(r.get("parent_STD_number"))
        )
    ]
    # also folder-only from selection
    folder_only = []
    for rel in sel_by_path:
        identity = _identity_row(rel, None)
        if identity["resolver_confidence"] in ("review_required", "unknown"):
            folder_only.append(
                {
                    "source_relative_path": rel,
                    "parent_STD_context": identity["parent_STD_context"],
                    "document_is_number": identity["document_is_number_filename_heuristic"],
                    "status": identity["review_status_label"],
                }
            )

    decision_questions = [
        "Should filename-derived IS tokens be accepted as UI 'Document IS' after spot-check, or only after verified metadata backfill?",
        "For Test Method files where filename IS ≠ parent STD folder, should default search filter be Document IS, Parent STD, or require explicit choice?",
        "Approve promoting standard_filter_v2_candidate into live answerability for IS 9666/2676 only, all standards, or neither yet?",
        "Which of the 20 proposed_unverified questions should enter the authoritative ≥80 gold set (if any)?",
        "How should folder-only / ambiguous paths (no filename IS) appear in the standards dropdown?",
    ]

    packet = {
        "packet_id": "human_review_packet_v2_standard_filter_v1",
        "generated_at": _utc(),
        "purpose": (
            "Human review of filename IS heuristic vs parent STD context, "
            "33 live answerability FNs, and 20 proposed_unverified gold candidates."
        ),
        "constraints_honored": {
            "source_pdfs_read": False,
            "chroma_client_opened": False,
            "ocr_extract_embed_reindex": False,
            "live_filter_or_thresholds_changed": False,
            "authoritative_gold_modified": False,
            "alias_policy_or_selection_overwritten": False,
            "existing_reports_overwritten": False,
            "commit": False,
        },
        "inputs_read_only": [
            diagnosis_path.name,
            candidate_eval_path.name,
            proposed_path.name,
            selection_path.name,
            "sample_collections/bis_pilot_representative_v2/chunks/*.json",
        ],
        "section_1_false_negatives": {
            "count": len(fn_rows),
            "expected_about": 33,
            "records": fn_rows,
        },
        "section_1_all_reliability_cases": {
            "count": len(case_rows),
            "records": case_rows,
        },
        "section_1_pilot_cases": {
            "count": len(pilot_rows),
            "records": pilot_rows,
        },
        "section_2_proposed_unverified_20": {
            "count": len(proposed_table),
            "status": "proposed_unverified",
            "expected_answer_all_null": all(r.get("expected_answer") is None for r in proposed_table),
            "gold_label_all_null": all(r.get("gold_label") is None for r in proposed_table),
            "records": proposed_table,
        },
        "section_3_ui_filter_recommendation": ui_recommendation,
        "section_4_shadow_comparison_unchanged_live": shadow_comparison,
        "ambiguous_or_conflicting_records": {
            "filename_vs_parent_conflicts_in_eval_rows": len(
                [r for r in case_rows + pilot_rows if r.get("filename_vs_parent_STD_conflict")]
            ),
            "folder_only_selection_paths": folder_only[:40],
            "folder_only_selection_path_count": len(folder_only),
            "sample_conflicts": cross_examples,
        },
        "decision_questions_for_reviewers": decision_questions,
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Markdown packet for humans
    lines = [
        "# Human review packet — v2 standard filter & gold proposals v1",
        "",
        f"- Generated: `{packet['generated_at']}`",
        "- Live filters / thresholds / API: **unchanged**",
        "- Chroma client: **not opened**; PDFs: **not read**",
        "- Authoritative gold / selection / alias policy: **unchanged**",
        "",
        "## Decision questions",
        "",
    ]
    for i, q in enumerate(decision_questions, 1):
        lines.append(f"{i}. {q}")
    lines += [
        "",
        "## UI filter recommendation (no live implementation)",
        "",
        f"**Recommendation:** `{ui_recommendation['recommendation']}`",
        "",
    ]
    for r in ui_recommendation["rationale"]:
        lines.append(f"- {r}")
    lines += [
        "",
        "### Cross-STD Test Method examples (filename IS ≠ parent STD)",
        "",
        "| Source path | Document IS (filename heuristic, unverified) | Parent STD context |",
        "|-------------|------------------------------|--------------------|",
    ]
    for ex in cross_examples:
        lines.append(
            f"| `{ex['source_relative_path']}` | {ex['document_is_number_filename_heuristic']} | "
            f"`{ex['parent_STD_context']}` |"
        )
    lines += [
        "",
        "## 33 live false negatives (`standard_filter_mismatch`)",
        "",
        "| Case | Document IS (heuristic) | Parent STD | Rank | Evidence chunk | Clause | Excerpt |",
        "|------|-------------------------|------------|-----:|----------------|--------|---------|",
    ]
    for r in fn_rows:
        ev = r.get("indexed_evidence") or {}
        excerpt = (ev.get("text_excerpt") or "").replace("|", "/")[:90]
        lines.append(
            f"| {r['case_id']} | {r.get('document_is_number')} *(unverified)* | "
            f"`{r.get('parent_STD_context')}` | {r.get('retrieval_gold_rank')} | "
            f"`{ev.get('chunk_id')}` | {ev.get('clause_number')} | {excerpt} |"
        )
    lines += [
        "",
        "## 20 proposed_unverified gold candidates",
        "",
        "| ID | Query | Document IS (heuristic) | Parent STD | Chunk | Clause | Pages | Review | proposed_answer | expected_answer | gold_label |",
        "|----|-------|-------------------------|------------|-------|--------|-------|--------|-----------------|-----------------|------------|",
    ]
    for r in proposed_table:
        q = (r.get("query") or "").replace("|", "/")[:80]
        pa = "proposed_unverified excerpt"
        lines.append(
            f"| {r.get('proposed_id')} | {q} | {r.get('document_is_number')} | "
            f"`{r.get('parent_STD_context')}` | `{r.get('evidence_chunk_id')}` | "
            f"{r.get('evidence_clause')} | {r.get('evidence_pages')} | "
            f"{r.get('evidence_review_status')} | {pa} | `null` | `null` |"
        )
    lines += [
        "",
        "## Shadow comparison (from prior offline eval; live unchanged)",
        "",
        "| Mode | Rel Pass@1 | Rel FN | Rel NOT_FOUND | Pilot Pass@1 | Pilot FN |",
        "|------|-----------:|-------:|--------------:|-------------:|---------:|",
    ]
    rel_c = shadow_comparison.get("reliability") or {}
    pil_c = shadow_comparison.get("pilot") or {}
    for mode in ("live", "prior_shadow_loose", "candidate_v2"):
        rm = rel_c.get(mode) or {}
        pm = pil_c.get(mode) or {}
        lines.append(
            f"| {mode} | {rm.get('pass_at_1')}/35 | {rm.get('false_negatives')} | "
            f"{rm.get('not_found_hard_reject')}/16 | {pm.get('pass_at_1')}/6 | "
            f"{pm.get('false_negatives')} |"
        )
    lines += [
        "",
        "## Ambiguity summary",
        "",
        f"- Folder-only selection paths (no filename IS): **{len(folder_only)}**",
        f"- Filename vs parent STD conflicts in eval rows: "
        f"**{packet['ambiguous_or_conflicting_records']['filename_vs_parent_conflicts_in_eval_rows']}**",
        "",
        "_Filename-derived Document IS is never labeled verified in this packet._",
        "",
    ]
    out_md.write_text("\n".join(lines), encoding="utf-8")

    print(f"fn_rows={len(fn_rows)} reliability_cases={len(case_rows)} pilot_cases={len(pilot_rows)}")
    print(f"proposed={len(proposed_table)} folder_only={len(folder_only)} conflicts={len(cross_examples)}")
    print(f"wrote={out_json.name}")
    print(f"wrote_md={out_md.name}")
    print("chroma_opened=false pdf_read=false live_unchanged=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
