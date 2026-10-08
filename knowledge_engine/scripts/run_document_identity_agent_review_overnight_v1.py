#!/usr/bin/env python3
"""
Overnight agent evidence review for pending document-identity worksheet rows.

Read-only on PDFs. Does NOT write registry/worksheet/gold/selection/alias.
Does NOT open Chroma. Recommendations are agent_review — never human_review_with_evidence.
"""

from __future__ import annotations

import json
import re
import sys
import traceback
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import pymupdf as fitz

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import _ensure_tesseract_available, _ocr_pixmap
from knowledge_engine.pilot.document_identity import normalize_rel_path
from knowledge_engine.pilot.document_identity_review_audit import (
    audit_registry_against_packet,
)
from knowledge_engine.pilot.document_identity_review_registry import (
    FORBIDDEN_OVERWRITE_NAMES,
    load_registry,
    validate_review_registry,
)

REPORT_ID = "document_identity_agent_review_overnight_v1"
_IS_RE = re.compile(r"\bIS\s*[:\-]?\s*(\d{3,5})(?:\s*(?:Part|Sec|Section)\s*[\dA-Za-z]+)?", re.I)
_STD_RE = re.compile(r"\bSTD\s+(\d+)\b", re.I)
_INDIAN_STD_LINE = re.compile(
    r"(?:Indian\s+Standard|IS\s*[:\-]?\s*\d{3,5})",
    re.I,
)


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_path(rel: str) -> str:
    parts = normalize_rel_path(rel).split("/")
    if len(parts) <= 2:
        return rel
    return f"{parts[0]}/…/{parts[-1]}"


def _safe_write(path: Path, text: str) -> None:
    if path.name in FORBIDDEN_OVERWRITE_NAMES:
        raise RuntimeError(f"refusing protected name {path.name}")
    if path.exists():
        raise RuntimeError(f"refusing overwrite existing {path.name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _load_chunk_texts_for_path(chunks_dir: Path, rel: str) -> list[dict[str, Any]]:
    rel_n = normalize_rel_path(rel)
    out: list[dict[str, Any]] = []
    if not chunks_dir.is_dir():
        return out
    for path in chunks_dir.glob("*__chunks.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        src = normalize_rel_path(str(data.get("source_relative_path") or ""))
        if src != rel_n:
            continue
        for ch in data.get("chunks") or []:
            text = ch.get("text") or ""
            if not text.strip():
                continue
            out.append(
                {
                    "chunk_id": ch.get("chunk_id"),
                    "clause_number": ch.get("clause_number"),
                    "pdf_pages": list(ch.get("pdf_pages") or []),
                    "review_status": ch.get("review_status"),
                    "text": text,
                    "excerpt": " ".join(text.split())[:220],
                }
            )
        break
    return out


def _find_is_mentions(text: str) -> list[str]:
    found = []
    for m in _IS_RE.finditer(text or ""):
        tok = f"IS {m.group(1)}"
        if tok not in found:
            found.append(tok)
    return found


def _page_native_texts(pdf_path: Path, max_pages: int = 3) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    with fitz.open(pdf_path) as doc:
        n = min(max_pages, doc.page_count)
        for i in range(n):
            page = doc.load_page(i)
            text = page.get_text("text") or ""
            pages.append(
                {
                    "page": i + 1,
                    "native_text": text,
                    "native_alnum": sum(c.isalnum() for c in text),
                    "method": "native",
                }
            )
    return pages


def _targeted_ocr_pages(pdf_path: Path, page_numbers: list[int], dpi: int = 200) -> list[dict[str, Any]]:
    """OCR only listed 1-based page numbers. Read-only PDF open."""
    out: list[dict[str, Any]] = []
    try:
        _ensure_tesseract_available()
    except Exception as exc:  # noqa: BLE001
        return [{"page": p, "error": f"tesseract_unavailable:{exc}", "method": "ocr_failed"} for p in page_numbers]
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    with fitz.open(pdf_path) as doc:
        for pno in page_numbers:
            idx = pno - 1
            if idx < 0 or idx >= doc.page_count:
                out.append({"page": pno, "error": "page_out_of_range", "method": "ocr_failed"})
                continue
            try:
                pix = doc.load_page(idx).get_pixmap(matrix=matrix, alpha=False)
                text = _ocr_pixmap(pix, lang="eng")
                out.append(
                    {
                        "page": pno,
                        "ocr_text": text,
                        "ocr_alnum": sum(c.isalnum() for c in text),
                        "method": "targeted_ocr",
                        "excerpt": " ".join((text or "").split())[:220],
                    }
                )
            except Exception as exc:  # noqa: BLE001
                out.append({"page": pno, "error": str(exc), "method": "ocr_failed"})
    return out


def _recommend_document_is(
    *,
    proposed: str | None,
    evidence_hits: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Agent recommendation only. Filename alone never verifies.
    verified requires explicit IS token match in indexed/PDF/OCR text.
    """
    if not proposed:
        if evidence_hits:
            # found some IS tokens but no proposed value
            return {
                "recommendation": "needs_review",
                "confidence": "low",
                "reason": "No filename Document IS proposal; evidence mentions other/unknown IS tokens — human must assign.",
                "supporting_evidence": evidence_hits[:3],
                "provenance_label": "agent_evidence_scan",
            }
        return {
            "recommendation": "needs_review",
            "confidence": "low",
            "reason": "Folder-only / missing Document IS; no confirming designation in available evidence.",
            "supporting_evidence": [],
            "provenance_label": "agent_evidence_scan",
        }

    prop_num = re.search(r"(\d+)", proposed)
    prop_n = prop_num.group(1) if prop_num else None
    matching = [h for h in evidence_hits if prop_n and prop_n in (h.get("matched_is") or "")]
    conflicting = [
        h
        for h in evidence_hits
        if h.get("matched_is")
        and prop_n
        and prop_n not in h["matched_is"]
        and h.get("role") in ("title_or_cover", "self_designation")
    ]

    if matching and not conflicting:
        best = matching[0]
        return {
            "recommendation": "verified",
            "confidence": "medium" if best.get("source") == "indexed_chunk" else "high",
            "reason": (
                f"Agent found explicit {proposed} designation in {best.get('source')} "
                f"(page/clause pointer below). Not human_review_with_evidence."
            ),
            "supporting_evidence": matching[:3],
            "provenance_label": "agent_pdf_or_chunk_evidence",
        }
    if conflicting and not matching:
        return {
            "recommendation": "needs_review",
            "confidence": "medium",
            "reason": "Cover/title evidence suggests a different IS than filename proposal — do not auto-reject without human.",
            "supporting_evidence": conflicting[:3],
            "provenance_label": "agent_evidence_scan",
        }
    if matching and conflicting:
        return {
            "recommendation": "needs_review",
            "confidence": "medium",
            "reason": "Both matching and conflicting IS designations found — unresolved.",
            "supporting_evidence": (matching + conflicting)[:4],
            "provenance_label": "agent_evidence_scan",
        }
    return {
        "recommendation": "needs_review",
        "confidence": "low",
        "reason": "No explicit Document IS designation found in indexed/PDF/OCR evidence; filename heuristic alone is insufficient.",
        "supporting_evidence": evidence_hits[:2],
        "provenance_label": "agent_evidence_scan",
    }


def _recommend_parent_std(
    *,
    parent_value: str | None,
    parent_number: str | None,
    proposed_doc_is: str | None,
    evidence_hits: list[dict[str, Any]],
) -> dict[str, Any]:
    """Parent STD is organizational; path folder / Document IS number match never verifies."""
    if not parent_value:
        return {
            "recommendation": "needs_review",
            "confidence": "low",
            "reason": "No Parent STD folder context available.",
            "supporting_evidence": [],
            "provenance_label": "agent_evidence_scan",
        }
    doc_n = None
    if proposed_doc_is:
        m = re.search(r"(\d+)", proposed_doc_is)
        doc_n = m.group(1) if m else None
    hits = []
    for h in evidence_hits:
        text = h.get("excerpt") or h.get("text_snippet") or ""
        # Explicit STD <n> token only
        if parent_number and re.search(rf"\bSTD\s*{parent_number}\b", text, re.I):
            hits.append(h)
            continue
        # Cross-STD: cites IS <parent> while Document IS is a different number
        if (
            parent_number
            and doc_n
            and parent_number != doc_n
            and re.search(rf"\bIS\s*[:\-]?\s*{parent_number}\b", text, re.I)
        ):
            hits.append({**h, "note": "cross_reference_different_from_document_is"})
    if hits:
        return {
            "recommendation": "verified",
            "confidence": "medium",
            "reason": (
                f"Agent found independent parent-context evidence for {parent_value} "
                "(not path-only; not Document IS self-designation)."
            ),
            "supporting_evidence": hits[:3],
            "provenance_label": "agent_pdf_or_chunk_evidence",
        }
    return {
        "recommendation": "needs_review",
        "confidence": "low",
        "reason": (
            f"Parent STD {parent_value} not independently confirmed. "
            "Folder path and Document IS number match are not Parent STD verification evidence."
        ),
        "supporting_evidence": [],
        "provenance_label": "agent_evidence_scan",
    }


def review_one_row(
    row: dict[str, Any],
    *,
    pdf_root: Path,
    chunks_dir: Path,
) -> dict[str, Any]:
    rel = normalize_rel_path(str(row.get("source_relative_path") or ""))
    doc_seed = row.get("seed_document_is") or {}
    par_seed = row.get("seed_parent_std") or {}
    proposed = doc_seed.get("value")
    parent_value = par_seed.get("value")
    parent_number = par_seed.get("number")
    if not parent_number and parent_value:
        m = re.search(r"(\d+)", str(parent_value))
        parent_number = m.group(1) if m else None

    result: dict[str, Any] = {
        "occurrence_id": row.get("occurrence_id"),
        "sha256": row.get("sha256"),
        "source_relative_path": rel,
        "path_short": _short_path(rel),
        "queue_tags": list(row.get("queue_tags") or []),
        "seed_document_is": {
            "value": proposed,
            "status": doc_seed.get("status"),
            "provenance": doc_seed.get("provenance"),
        },
        "seed_parent_std": {
            "value": parent_value,
            "number": parent_number,
            "status": par_seed.get("status"),
            "provenance": par_seed.get("provenance"),
        },
        "agent_kind": "automated_agent_review",
        "not_human_review": True,
        "pdf_inspected": False,
        "targeted_ocr_used": False,
        "pdf_missing": False,
        "ocr_failures": [],
        "unresolved_questions": [],
        "evidence_trail": [],
    }

    evidence_hits: list[dict[str, Any]] = []

    # 1) Worksheet evidence pointers
    for ev in row.get("evidence_pointers") or []:
        result["evidence_trail"].append(
            {
                "source": "worksheet_pointer",
                "chunk_id": ev.get("chunk_id"),
                "clause_number": ev.get("clause_number"),
                "pdf_pages": ev.get("pdf_pages"),
                "excerpt": ev.get("excerpt_ref"),
            }
        )

    # 2) Indexed chunk artifacts
    chunks = _load_chunk_texts_for_path(chunks_dir, rel)
    titleish = []
    for ch in chunks[:40]:
        mentions = _find_is_mentions(ch["text"])
        # Prefer early pages / scope / title-like
        pages = ch.get("pdf_pages") or []
        role = "indexed_body"
        if pages and min(pages) <= 2:
            role = "title_or_cover"
        if ch.get("clause_number") in (None, "", "0.1", "1", "1.1") or (
            isinstance(ch.get("clause_number"), str)
            and ch["clause_number"].startswith("0.")
        ):
            if role != "title_or_cover":
                role = "self_designation"
        for m in mentions:
            hit = {
                "source": "indexed_chunk",
                "role": role,
                "matched_is": m,
                "chunk_id": ch.get("chunk_id"),
                "clause_number": ch.get("clause_number"),
                "pdf_pages": pages,
                "excerpt": ch.get("excerpt"),
                "text_snippet": ch.get("excerpt"),
            }
            evidence_hits.append(hit)
            if role == "title_or_cover":
                titleish.append(hit)
        # also capture Indian Standard lines without clear parse
        if _INDIAN_STD_LINE.search(ch["text"][:500]) and not mentions:
            evidence_hits.append(
                {
                    "source": "indexed_chunk",
                    "role": role,
                    "matched_is": None,
                    "chunk_id": ch.get("chunk_id"),
                    "clause_number": ch.get("clause_number"),
                    "pdf_pages": pages,
                    "excerpt": ch.get("excerpt"),
                }
            )

    # 3) PDF cover/title pages if identity still unclear for Document IS
    need_pdf = True
    if proposed:
        prop_n = re.search(r"(\d+)", str(proposed))
        pn = prop_n.group(1) if prop_n else None
        if pn and any(
            h.get("matched_is") == f"IS {pn}" and h.get("role") in ("title_or_cover", "self_designation")
            for h in evidence_hits
        ):
            need_pdf = False
    if not proposed:
        need_pdf = True  # try to discover designation

    pdf_path = pdf_root / rel
    page_inspect: list[dict[str, Any]] = []
    if need_pdf:
        if not pdf_path.is_file():
            result["pdf_missing"] = True
            result["unresolved_questions"].append("PDF missing at configured source path")
        else:
            result["pdf_inspected"] = True
            try:
                page_inspect = _page_native_texts(pdf_path, max_pages=3)
            except Exception as exc:  # noqa: BLE001
                result["unresolved_questions"].append(f"PDF open/read failed: {exc}")
                page_inspect = []

            weak_pages = []
            for pg in page_inspect:
                text = pg.get("native_text") or ""
                mentions = _find_is_mentions(text)
                excerpt = " ".join(text.split())[:220]
                for m in mentions:
                    evidence_hits.append(
                        {
                            "source": "pdf_native",
                            "role": "title_or_cover" if pg["page"] <= 2 else "body",
                            "matched_is": m,
                            "pdf_pages": [pg["page"]],
                            "excerpt": excerpt,
                            "text_snippet": excerpt,
                        }
                    )
                if pg.get("native_alnum", 0) < 40:
                    weak_pages.append(pg["page"])
                result["evidence_trail"].append(
                    {
                        "source": "pdf_native",
                        "page": pg["page"],
                        "native_alnum": pg.get("native_alnum"),
                        "excerpt": excerpt[:160],
                        "is_mentions": mentions,
                    }
                )

            # Targeted OCR only for weak early pages when still no match
            prop_n = None
            if proposed:
                mm = re.search(r"(\d+)", str(proposed))
                prop_n = mm.group(1) if mm else None
            has_match = prop_n and any(
                h.get("matched_is") == f"IS {prop_n}" for h in evidence_hits
            )
            if (not has_match) and weak_pages:
                result["targeted_ocr_used"] = True
                ocr_pages = _targeted_ocr_pages(pdf_path, weak_pages[:3])
                for op in ocr_pages:
                    if op.get("method") == "ocr_failed":
                        result["ocr_failures"].append(op)
                        continue
                    text = op.get("ocr_text") or ""
                    mentions = _find_is_mentions(text)
                    excerpt = op.get("excerpt") or " ".join(text.split())[:220]
                    for m in mentions:
                        evidence_hits.append(
                            {
                                "source": "targeted_ocr",
                                "role": "title_or_cover",
                                "matched_is": m,
                                "pdf_pages": [op["page"]],
                                "excerpt": excerpt,
                                "text_snippet": excerpt,
                            }
                        )
                    result["evidence_trail"].append(
                        {
                            "source": "targeted_ocr",
                            "page": op["page"],
                            "excerpt": excerpt[:160],
                            "is_mentions": mentions,
                        }
                    )

    doc_rec = _recommend_document_is(proposed=proposed, evidence_hits=evidence_hits)
    par_rec = _recommend_parent_std(
        parent_value=parent_value,
        parent_number=parent_number,
        proposed_doc_is=proposed,
        evidence_hits=evidence_hits,
    )

    # Never claim human provenance
    assert "human_review" not in (doc_rec.get("provenance_label") or "")
    assert "human_review" not in (par_rec.get("provenance_label") or "")

    if doc_rec["recommendation"] == "needs_review":
        result["unresolved_questions"].append(
            "Document IS still needs human confirmation with designation page evidence."
        )
    if par_rec["recommendation"] == "needs_review":
        result["unresolved_questions"].append(
            "Parent/Product STD filing context still needs human confirmation."
        )

    result["document_is_recommendation"] = doc_rec
    result["parent_std_recommendation"] = par_rec
    result["evidence_hit_count"] = len(evidence_hits)
    result["indexed_chunk_count"] = len(chunks)
    return result


def consistency_check(
    registry: dict[str, Any],
    worksheet: dict[str, Any],
    decisions_dir: Path,
    packet: dict[str, Any],
    seed_skips: dict[str, Any],
    path_to_sha: dict[str, str],
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    validate_review_registry(registry)

    # Load all decision batches — do not mutate
    decided_oids: dict[str, str] = {}
    for p in sorted(decisions_dir.glob("document_identity_review_decisions_*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        for row in data.get("rows_applied") or []:
            oid = row.get("occurrence_id")
            if not oid:
                continue
            if oid in decided_oids:
                findings.append(
                    {
                        "code": "duplicate_decision_occurrence",
                        "occurrence_id": oid,
                        "files": [decided_oids[oid], p.name],
                    }
                )
            decided_oids[oid] = p.name

    ws_by_oid = {r["occurrence_id"]: r for r in worksheet.get("rows") or []}
    for oid, fname in decided_oids.items():
        row = ws_by_oid.get(oid)
        if not row:
            findings.append({"code": "decision_missing_worksheet_row", "occurrence_id": oid, "file": fname})
            continue
        if not row.get("worksheet_row_complete"):
            findings.append(
                {
                    "code": "decision_not_marked_complete_on_worksheet",
                    "occurrence_id": oid,
                    "file": fname,
                }
            )
        # User decisions must remain needs_review/reject/verify as recorded — check status match
        rd = (row.get("reviewer_document_is") or {}).get("status")
        rp = (row.get("reviewer_parent_std") or {}).get("status")
        # Find decision
        # already in file — skip deep reload
        if rd == "verified" or rp == "verified":
            # prior user batches were all needs_review; flag unexpected verified in worksheet reviewer fields
            findings.append(
                {
                    "code": "worksheet_has_verified_reviewer_status",
                    "occurrence_id": oid,
                    "document_is_status": rd,
                    "parent_std_status": rp,
                }
            )

    # Registry statuses for decided rows should match needs_review from user batches
    occ_by_id = {o["occurrence_id"]: o for o in registry.get("path_occurrences") or []}
    content_by_sha = {c["sha256"]: c for c in registry.get("content_records") or []}
    for oid in decided_oids:
        occ = occ_by_id.get(oid)
        if not occ:
            findings.append({"code": "decision_missing_registry_occurrence", "occurrence_id": oid})
            continue
        crec = content_by_sha.get(occ.get("sha256"))
        if not crec:
            findings.append({"code": "occurrence_orphan_sha", "occurrence_id": oid})
            continue

    audit = audit_registry_against_packet(
        registry,
        packet,
        seed_skips=seed_skips,
        path_to_sha_from_chunks=path_to_sha,
    )

    # Rename links
    for link in registry.get("occurrence_links") or []:
        if link.get("from_occurrence_id") not in occ_by_id or link.get("to_occurrence_id") not in occ_by_id:
            findings.append({"code": "broken_occurrence_link", "link": link})

    return {
        "findings": findings,
        "decided_occurrence_count": len(decided_oids),
        "worksheet_complete_count": sum(
            1 for r in worksheet.get("rows") or [] if r.get("worksheet_row_complete")
        ),
        "registry_audit": {
            "integrity_ok": audit.get("integrity_ok"),
            "counts": audit.get("counts"),
            "mismatch_count": len(audit.get("mismatches") or []),
            "mismatches": audit.get("mismatches") or [],
            "why_1_to_1": (audit.get("why_active_equals_content_records") or {}).get("equals_1_to_1"),
            "skipped_missing_hash_paths": audit.get("skipped_missing_hash_paths") or [],
            "verified_annotation_count": audit.get("verified_annotation_count"),
        },
        "user_decisions_preserved": True,
        "note": "Consistency check is read-only; user decisions were not modified.",
    }


def run_safe_tests() -> dict[str, Any]:
    """Only known synthetic/mock tests that do not open Chroma/PDF/network."""
    import subprocess

    safe = [
        "knowledge_engine.scripts.test_document_identity_review_registry",
        "knowledge_engine.scripts.test_document_identity_review_audit",
        "knowledge_engine.scripts.test_collection_guards",
        "knowledge_engine.scripts.test_standard_filter_v2_candidate",
        "knowledge_engine.scripts.test_alias_policy",
        "knowledge_engine.scripts.test_alias_dedupe_regressions",
    ]
    skipped = [
        {
            "module": "knowledge_engine.scripts.test_api_selection_mocks",
            "reason": "May import API server surface; safety for overnight run not guaranteed without Chroma risk review.",
        },
        {
            "module": "knowledge_engine.scripts.test_move_rename_resilience",
            "reason": "May touch filesystem/path fixtures beyond pure mocks.",
        },
        {
            "module": "knowledge_engine.scripts.test_v2_pipeline_resilience",
            "reason": "Pipeline resilience may exercise broader adapters; skipped for safety.",
        },
        {
            "module": "knowledge_engine.scripts.test_alias_pipeline_integration",
            "reason": "Integration scope unclear for Chroma/PDF; skipped.",
        },
    ]
    results = []
    py = sys.executable
    for mod in safe:
        try:
            proc = subprocess.run(
                [py, "-m", mod],
                cwd=str(_REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            results.append(
                {
                    "module": mod,
                    "exit_code": proc.returncode,
                    "ok": proc.returncode == 0,
                    "stdout_tail": (proc.stdout or "")[-500:],
                    "stderr_tail": (proc.stderr or "")[-300:],
                }
            )
        except Exception as exc:  # noqa: BLE001
            results.append({"module": mod, "ok": False, "error": str(exc)})
    return {
        "ran": results,
        "skipped": skipped,
        "all_ran_ok": all(r.get("ok") for r in results),
    }


def _load_path_hash_index(chunks_dir: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not chunks_dir.is_dir():
        return out
    for path in chunks_dir.glob("*__chunks.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rel = normalize_rel_path(str(data.get("source_relative_path") or ""))
        sha = (data.get("source_file_hash_sha256") or "").strip().lower()
        if not rel or len(sha) != 64:
            for ch in data.get("chunks") or []:
                sha = (ch.get("source_file_hash") or "").strip().lower()
                if len(sha) == 64:
                    break
        if rel and len(sha) == 64:
            out[rel] = sha
    return out


def to_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# {report['report_id']}",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Agent kind: **automated agent review** (NOT human review)",
        f"- Registry/worksheet written: **{report['constraints_honored']['registry_worksheet_unchanged']}**",
        f"- Chroma opened: **false**; live filter unchanged: **true**",
        "",
        "## Totals",
        "",
    ]
    for k, v in (report.get("totals") or {}).items():
        lines.append(f"- `{k}`: {v}")
    lines += ["", "## Skipped / missing hash (unresolved, not linked)", ""]
    for s in report.get("skipped_missing_hash") or []:
        lines.append(
            f"- `{s.get('source_relative_path')}` — {s.get('reason')} "
            f"(must not join content identity without hash)"
        )
    lines += ["", "## Consistency findings", ""]
    cons = report.get("consistency") or {}
    findings = cons.get("findings") or []
    if not findings:
        lines.append("_No worksheet/decision/registry inconsistencies beyond registry audit notes._")
    else:
        for f in findings:
            lines.append(f"- `{f.get('code')}`: {json.dumps(f, ensure_ascii=False)[:240]}")
    ra = cons.get("registry_audit") or {}
    lines.append(
        f"- Registry integrity_ok={ra.get('integrity_ok')} mismatches={ra.get('mismatch_count')} "
        f"verified_annotations={ra.get('verified_annotation_count')}"
    )
    lines += ["", "## Safe tests", ""]
    tests = report.get("safe_tests") or {}
    lines.append(f"- all_ran_ok: **{tests.get('all_ran_ok')}**")
    for r in tests.get("ran") or []:
        lines.append(f"- `{r.get('module')}`: {'PASS' if r.get('ok') else 'FAIL'} (exit {r.get('exit_code')})")
    for s in tests.get("skipped") or []:
        lines.append(f"- SKIP `{s.get('module')}` — {s.get('reason')}")
    lines += ["", "## Per-row agent recommendations", ""]
    for row in report.get("reviewed_rows") or []:
        doc = row.get("document_is_recommendation") or {}
        par = row.get("parent_std_recommendation") or {}
        lines += [
            f"### {_short_path(row.get('source_relative_path') or '')}",
            "",
            f"- Full path: `{row.get('source_relative_path')}`",
            f"- Occurrence: `{row.get('occurrence_id')}`",
            f"- Seed Document IS: `{(row.get('seed_document_is') or {}).get('value')}` "
            f"({(row.get('seed_document_is') or {}).get('provenance')})",
            f"- Seed Parent STD: `{(row.get('seed_parent_std') or {}).get('value')}` "
            f"({(row.get('seed_parent_std') or {}).get('provenance')})",
            f"- **Document IS recommendation:** `{doc.get('recommendation')}` "
            f"(confidence={doc.get('confidence')}) — {doc.get('reason')}",
            f"- **Parent STD recommendation:** `{par.get('recommendation')}` "
            f"(confidence={par.get('confidence')}) — {par.get('reason')}",
            f"- PDF inspected: {row.get('pdf_inspected')}; OCR used: {row.get('targeted_ocr_used')}; "
            f"PDF missing: {row.get('pdf_missing')}",
        ]
        sev = (doc.get("supporting_evidence") or [])[:2]
        if sev:
            lines.append("- Document IS evidence:")
            for e in sev:
                lines.append(
                    f"  - {e.get('source')} {e.get('matched_is')} "
                    f"pages={e.get('pdf_pages')} chunk={e.get('chunk_id')} — "
                    f"{(e.get('excerpt') or '')[:140]}"
                )
        pev = (par.get("supporting_evidence") or [])[:2]
        if pev:
            lines.append("- Parent STD evidence:")
            for e in pev:
                lines.append(
                    f"  - {e.get('source')} pages={e.get('pdf_pages')} — {(e.get('excerpt') or '')[:140]}"
                )
        uq = row.get("unresolved_questions") or []
        if uq:
            lines.append("- Unresolved:")
            for q in uq:
                lines.append(f"  - {q}")
        if row.get("ocr_failures"):
            lines.append(f"- OCR failures: {len(row['ocr_failures'])}")
        lines.append("")
    lines += ["", "## Constraints honored", ""]
    for k, v in (report.get("constraints_honored") or {}).items():
        lines.append(f"- `{k}`: {v}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    settings = load_settings()
    assert settings.vector_db_path and settings.pdf_source_dir
    diag = settings.vector_db_path / "diagnostics" / "pilot"
    chunks_dir = (
        settings.vector_db_path
        / "sample_collections"
        / "bis_pilot_representative_v2"
        / "chunks"
    )
    pdf_root = Path(settings.pdf_source_dir)

    out_json = diag / f"{REPORT_ID}.json"
    out_md = diag / f"{REPORT_ID}.md"
    progress_path = diag / f"{REPORT_ID}_progress.json"

    for p in (out_json, out_md):
        if p.exists():
            print(f"ERROR: exists {p.name}", file=sys.stderr)
            return 2

    worksheet = json.loads(
        (diag / "document_identity_reviewer_worksheet_v1.json").read_text(encoding="utf-8")
    )
    registry = load_registry(diag / "document_identity_review_registry_v1.json")
    packet = json.loads(
        (diag / "human_review_packet_v2_standard_filter_v1.json").read_text(encoding="utf-8")
    )
    skips_path = diag / "document_identity_review_registry_v1_seed_skips.json"
    seed_skips = json.loads(skips_path.read_text(encoding="utf-8")) if skips_path.is_file() else {}

    pending = [r for r in worksheet.get("rows") or [] if not r.get("worksheet_row_complete")]
    skipped = list(worksheet.get("skipped_missing_hash_rows") or [])

    reviewed: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for i, row in enumerate(pending, 1):
        try:
            rec = review_one_row(row, pdf_root=pdf_root, chunks_dir=chunks_dir)
            reviewed.append(rec)
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "source_relative_path": row.get("source_relative_path"),
                    "occurrence_id": row.get("occurrence_id"),
                    "error": str(exc),
                    "traceback": traceback.format_exc()[-800:],
                }
            )
        # Progress checkpoint (overwrite only progress file allowed as same run)
        progress = {
            "report_id": REPORT_ID,
            "updated_at": _utc(),
            "completed": len(reviewed),
            "pending_total": len(pending),
            "errors": len(errors),
            "last_path": (reviewed[-1]["source_relative_path"] if reviewed else None),
        }
        progress_path.write_text(json.dumps(progress, indent=2) + "\n", encoding="utf-8")
        print(f"progress {i}/{len(pending)} {row.get('source_relative_path')}", flush=True)

    path_to_sha = _load_path_hash_index(chunks_dir)
    consistency = consistency_check(
        registry, worksheet, diag, packet, seed_skips, path_to_sha
    )
    print("running_safe_tests...", flush=True)
    safe_tests = run_safe_tests()

    # totals
    doc_recs = Counter(
        (r.get("document_is_recommendation") or {}).get("recommendation") for r in reviewed
    )
    par_recs = Counter(
        (r.get("parent_std_recommendation") or {}).get("recommendation") for r in reviewed
    )
    totals = {
        "pending_rows_reviewed": len(reviewed),
        "pending_row_errors": len(errors),
        "skipped_missing_hash": len(skipped),
        "document_is_verified_recommendations": doc_recs.get("verified", 0),
        "document_is_rejected_recommendations": doc_recs.get("rejected", 0),
        "document_is_needs_review_recommendations": doc_recs.get("needs_review", 0),
        "parent_std_verified_recommendations": par_recs.get("verified", 0),
        "parent_std_rejected_recommendations": par_recs.get("rejected", 0),
        "parent_std_needs_review_recommendations": par_recs.get("needs_review", 0),
        "pdfs_missing": sum(1 for r in reviewed if r.get("pdf_missing")),
        "pdfs_inspected": sum(1 for r in reviewed if r.get("pdf_inspected")),
        "targeted_ocr_rows": sum(1 for r in reviewed if r.get("targeted_ocr_used")),
        "targeted_ocr_failures": sum(len(r.get("ocr_failures") or []) for r in reviewed),
        "consistency_finding_count": len(consistency.get("findings") or []),
        "registry_integrity_ok": (consistency.get("registry_audit") or {}).get("integrity_ok"),
        "safe_tests_all_ok": safe_tests.get("all_ran_ok"),
    }

    report = {
        "report_id": REPORT_ID,
        "generated_at": _utc(),
        "purpose": (
            "Automated agent evidence recommendations for remaining pending identity rows. "
            "Not human review; does not write registry/worksheet."
        ),
        "constraints_honored": {
            "registry_worksheet_unchanged": True,
            "no_human_review_with_evidence_provenance": True,
            "no_auto_verify_written_to_registry": True,
            "no_chroma": True,
            "no_reindex_embed": True,
            "no_live_filter_change": True,
            "no_gold_selection_alias_overwrite": True,
            "source_pdfs_read_only": True,
            "no_git_commit": True,
            "missing_hash_not_linked": True,
        },
        "totals": totals,
        "skipped_missing_hash": skipped,
        "reviewed_rows": reviewed,
        "review_errors": errors,
        "consistency": consistency,
        "safe_tests": safe_tests,
        "prior_user_decision_batches_untouched": True,
    }

    _safe_write(out_json, json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    _safe_write(out_md, to_markdown(report))
    # final progress
    progress_path.write_text(
        json.dumps(
            {
                "report_id": REPORT_ID,
                "updated_at": _utc(),
                "status": "complete",
                "out_json": str(out_json),
                "out_md": str(out_md),
                "totals": totals,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote={out_json}")
    print(f"wrote_md={out_md}")
    print("totals", json.dumps(totals))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
