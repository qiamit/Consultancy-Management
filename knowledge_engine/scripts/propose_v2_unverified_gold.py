#!/usr/bin/env python3
"""
Propose 20 additional second-pilot gold candidate questions from indexed v2 evidence.

Read-only. Marks all as proposed_unverified — does NOT invent expected answers
or add them to authoritative eval JSON.
"""

from __future__ import annotations

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
from knowledge_engine.pilot.constants import SECOND_PILOT_COLLECTION_NAME
from knowledge_engine.scripts.run_post_v2_validation import EXPECTED_V2_COUNT, open_v2_readonly

EXISTING_EVAL = [
    Path(__file__).resolve().parents[1] / "eval" / "reliability_eval_v1.json",
    Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json",
]

_SKIP_CLAUSE = re.compile(r"^0+(\.0+)*$|^0\.\d+$", re.I)


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _existing_queries() -> set[str]:
    out: set[str] = set()
    for p in EXISTING_EVAL:
        data = json.loads(p.read_text(encoding="utf-8"))
        for key in ("answerable", "unanswerable"):
            for c in data.get(key) or []:
                q = (c.get("query") or "").strip().lower()
                if q:
                    out.add(q)
    return out


def _clause_ok(clause: str | None) -> bool:
    if not clause:
        return False
    c = clause.strip()
    if len(c) < 1 or len(c) > 48:
        return False
    if _SKIP_CLAUSE.match(c):
        return False
    # Prefer real clause-ish labels
    if not re.search(r"[A-Za-z0-9]", c):
        return False
    # Skip pure page markers
    if re.fullmatch(r"p?\d+", c, re.I):
        return False
    return True


def _snippet(text: str) -> str:
    t = " ".join((text or "").split())
    # Drop leading clause echo like "4.2 SCOPE —"
    t = re.sub(r"^[A-Z0-9.\-]+\s+", "", t)
    # Take a window with letters
    if len(t) < 60:
        return t[:180]
    # Prefer sentence with >= 6 letter words
    parts = re.split(r"(?<=[.:;])\s+", t)
    for p in parts:
        words = re.findall(r"[A-Za-z\u0900-\u097F]{4,}", p)
        if len(words) >= 4:
            return p[:180]
    return t[:180]


def _is_hint_from_path(rel: str) -> str | None:
    m = re.search(r"\bIS\s*(\d+)", Path(rel).name, re.I)
    if m:
        return f"IS {m.group(1)}"
    return None


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("ERROR: vector db unset", file=sys.stderr)
        return 2

    out_path = (
        settings.vector_db_path
        / "diagnostics"
        / "pilot"
        / "proposed_unverified_gold_v2_plus20_v1.json"
    )
    # Allow regenerate of this proposal artifact only (versioned name unchanged; user asked new list)
    # If exists from weak prior run, overwrite THIS proposal file only — not gold/eval/manifests.
    # User said: existing gold labels, manifests and reports overwrite न करें — proposal file is new artifact we own.
    # Prefer not silent overwrite if already good; here we replace weak draft intentionally once.

    _model, collection, col_name, _p = open_v2_readonly(settings.vector_db_path)
    count = int(collection.count())
    if col_name != SECOND_PILOT_COLLECTION_NAME or count != EXPECTED_V2_COUNT:
        print("ABORT: unexpected collection", file=sys.stderr)
        return 3

    existing_q = _existing_queries()
    raw = collection.get(include=["documents", "metadatas"])
    ids = raw.get("ids") or []
    docs = raw.get("documents") or []
    metas = raw.get("metadatas") or []

    pool: list[dict[str, Any]] = []
    for i, cid in enumerate(ids):
        meta = metas[i] or {}
        if (meta.get("review_status") or "usable") != "usable":
            continue
        text = (docs[i] or "").strip()
        if len(text) < 120:
            continue
        clause = (meta.get("clause_number") or "").strip() or None
        if not _clause_ok(clause):
            continue
        rel = meta.get("source_relative_path") or ""
        if not rel or "9666" in rel or rel.startswith("STD 21/"):
            continue
        snip = _snippet(text)
        letter_words = re.findall(r"[A-Za-z\u0900-\u097F]{4,}", snip)
        if len(letter_words) < 5:
            continue
        folder = rel.split("/")[0] if "/" in rel else rel
        pool.append(
            {
                "chunk_id": cid,
                "clause": clause,
                "rel": rel,
                "folder": folder,
                "snip": snip,
                "meta": meta,
                "text": text,
            }
        )

    # Diversify: round-robin by folder
    by_folder: dict[str, list[dict[str, Any]]] = {}
    for row in pool:
        by_folder.setdefault(row["folder"], []).append(row)
    folders = sorted(by_folder.keys(), key=lambda f: (-len(by_folder[f]), f))

    candidates: list[dict[str, Any]] = []
    used_folders: set[str] = set()
    used_clauses: set[str] = set()
    idx = 0
    while len(candidates) < 20 and folders:
        progressed = False
        for folder in list(folders):
            if len(candidates) >= 20:
                break
            rows = by_folder.get(folder) or []
            while rows:
                row = rows.pop(0)
                ck = f"{folder}|{row['clause']}"
                if ck in used_clauses:
                    continue
                is_hint = _is_hint_from_path(row["rel"])
                topic = " ".join(re.findall(r"[A-Za-z\u0900-\u097F]{4,}", row["snip"])[:8])
                if not topic:
                    continue
                n = len(candidates)
                if n % 3 == 0:
                    q = f"What does clause {row['clause']} say about {topic}?"
                    lang = "en"
                elif n % 3 == 1:
                    q = f"Explain the requirement in clause {row['clause']} ({topic})."
                    lang = "en"
                else:
                    q = f"खण्ड {row['clause']} में {topic.split()[0]} संबंधी क्या लिखा है?"
                    lang = "hi"
                if q.strip().lower() in existing_q:
                    continue
                used_clauses.add(ck)
                used_folders.add(folder)
                candidates.append(
                    {
                        "proposed_id": f"v2u_{len(candidates)+1:02d}",
                        "status": "proposed_unverified",
                        "human_review": "pending",
                        "query": q,
                        "lang_guess": lang,
                        "standard_filter_hint": is_hint or "all",
                        "evidence_reference": {
                            "collection": col_name,
                            "chunk_id": row["chunk_id"],
                            "clause_number": row["clause"],
                            "source_relative_path": row["rel"],
                            "sample_label": row["meta"].get("sample_label"),
                            "document_id": row["meta"].get("document_id"),
                            "text_preview": row["snip"],
                            "note": (
                                "Evidence pointer only — NOT an approved gold label "
                                "or expected answer. Human must verify before promotion."
                            ),
                        },
                        "expected_answer": None,
                        "gold_label": None,
                        "authoritative_eval_added": False,
                    }
                )
                progressed = True
                break
            if not rows:
                folders = [f for f in folders if by_folder.get(f)]
        if not progressed:
            break
        idx += 1
        if idx > 500:
            break

    report = {
        "report_id": "proposed_unverified_gold_v2_plus20_v1",
        "generated_at": _utc(),
        "status": "proposed_unverified",
        "human_review": "pending",
        "existing_authored_cases": 60,
        "proposed_additional": len(candidates),
        "folders_represented": sorted(used_folders),
        "toward_min_80": {
            "after_acceptance_if_all_verified": 60 + len(candidates),
            "note": "Do not count as gold until human verifies chunk↔question mapping.",
        },
        "collection": col_name,
        "chunk_count_verified": count,
        "rules": [
            "No invented expected answers",
            "Not added to reliability_eval_v1.json or pilot_eval_v1.json",
            "Evidence references are retrieval pointers for reviewers only",
        ],
        "candidates": candidates,
        "writes_to_authoritative_gold": False,
        "reindex": False,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"proposed={len(candidates)} folders={len(used_folders)} wrote={out_path.name}")
    return 0 if len(candidates) == 20 else 1


if __name__ == "__main__":
    raise SystemExit(main())
