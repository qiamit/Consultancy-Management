#!/usr/bin/env python3
"""Pilot-specific retrieval evaluation on bis_pilot_representative_v1."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.extract_pdf import default_diagnostics_dir
from knowledge_engine.scripts.run_reliability_eval import _run_case
from knowledge_engine.search_pipeline import open_search_collection

EVAL_PATH = Path(__file__).resolve().parents[1] / "eval" / "pilot_eval_v1.json"


def main() -> int:
    settings = load_settings()
    if settings.vector_db_path is None:
        print("KNOWLEDGE_VECTOR_DB_PATH unset", file=sys.stderr)
        return 2
    dataset = json.loads(EVAL_PATH.read_text(encoding="utf-8"))
    model, collection, col_name, persist = open_search_collection(settings.vector_db_path)
    a = [_run_case(collection, c) for c in dataset["answerable"]]
    u = [_run_case(collection, c) for c in dataset["unanswerable"]]
    a_pass = sum(1 for r in a if r["pass_at_1"])
    u_rej = sum(1 for r in u if r["verdict"] == "pass_reject")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "collection": col_name,
        "model": model,
        "persist_dir": str(persist),
        "answerable_pass_at_1": a_pass,
        "answerable_total": len(a),
        "not_found_hard_reject": u_rej,
        "unanswerable_total": len(u),
        "answerable_results": a,
        "unanswerable_results": u,
    }
    out = default_diagnostics_dir(settings) / "pilot" / "pilot_eval_v1_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Pilot Pass@1: {a_pass}/{len(a)}")
    print(f"NOT_FOUND reject: {u_rej}/{len(u)}")
    print(f"Report: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
