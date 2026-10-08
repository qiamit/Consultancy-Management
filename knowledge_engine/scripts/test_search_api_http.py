#!/usr/bin/env python3
"""HTTP tests for the local knowledge search API (no Chroma, no model download)."""

from __future__ import annotations

import io
import json
import sys
import threading
from contextlib import redirect_stderr
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.scripts.serve_knowledge_search_api import Handler, STATE


class _FakeCollection:
    def __init__(self) -> None:
        self.fail_query = False
        self.ids = ["doc_x:p0001:c001"]
        self.documents = ["1.1 This standard covers the scope of this standard for testing."]
        self.metadatas = [
            {
                "review_status": "usable",
                "is_number": "IS 2142",
                "sample_label": "doc_x",
                "source_relative_path": "STD 2142/IS 2142.pdf",
                "clause_number": "1.1",
                "pdf_pages": [1],
            }
        ]

    def get(self, include=None):  # noqa: ANN001
        return {
            "ids": list(self.ids),
            "documents": list(self.documents),
            "metadatas": list(self.metadatas),
        }

    def query(self, query_texts=None, n_results=1):  # noqa: ANN001
        if self.fail_query:
            raise RuntimeError("boom /Users/secret/chroma")
        n = max(0, min(int(n_results or 0), len(self.ids)))
        return {
            "ids": [self.ids[:n]],
            "distances": [[0.2] * n],
        }

    def count(self) -> int:
        return len(self.ids)


def _check(name: str, cond: bool, detail: str = "") -> tuple[str, bool, str]:
    return name, bool(cond), detail


def _request(port: int, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(f"http://127.0.0.1:{port}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw)


def _log_message_checks() -> list[tuple[str, bool, str]]:
    handler = Handler.__new__(Handler)
    handler.command = "POST"
    handler.client_address = ("127.0.0.1", 9)
    buf = io.StringIO()
    raised = False
    try:
        with redirect_stderr(buf):
            handler.log_message('"%s" %s %s', "POST /search?q=secret HTTP/1.1", "200", "12")
            handler.log_message("%d", 503)
    except (TypeError, ValueError):
        raised = True
    logged = buf.getvalue()
    return [
        _check("log.no_raise", not raised),
        _check("log.has_status", "200" in logged and "503" in logged, logged.strip()),
        _check("log.no_query", "secret" not in logged, logged.strip()),
    ]


def main() -> int:
    checks: list[tuple[str, bool, str]] = []
    STATE.collection = None
    STATE.collection_name = ""
    STATE.collection_count = 0
    STATE.model_name = ""
    STATE.error = "no_collection"
    STATE.standards_cache = None
    STATE.persist_dir = ""

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = int(httpd.server_address[1])
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        status, health = _request(port, "GET", "/health")
        checks.append(_check("health.status", status == 503, str(status)))
        checks.append(_check("health.json_ok", health.get("ok") is False))
        checks.append(_check("health.message", isinstance(health.get("message_hi"), str)))

        fake = _FakeCollection()
        STATE.collection = fake
        STATE.collection_name = "bis_pilot_representative_v1"
        STATE.collection_count = 1
        STATE.model_name = "test-model"
        STATE.error = None
        STATE.standards_cache = None

        status, standards = _request(port, "GET", "/standards")
        ids = [row.get("id") for row in standards.get("standards") or []]
        checks.append(_check("standards.status", status == 200, str(status)))
        checks.append(_check("standards.all", ids[:1] == ["all"], str(ids)))
        checks.append(_check("standards.is_2142", "IS 2142" in ids, str(ids)))

        status, all_body = _request(
            port, "POST", "/search", {"query": "scope of this standard", "standard": "all"}
        )
        checks.append(_check("search.all.status", status == 200, str(status)))
        checks.append(_check("search.all.ok", all_body.get("ok") is True))
        checks.append(_check("search.all.results", isinstance(all_body.get("results"), list)))
        checks.append(
            _check("search.all.evidence", isinstance(all_body.get("evidence_chunks"), list))
        )

        status, is_body = _request(
            port, "POST", "/search", {"query": "scope of this standard", "standard": "IS 2142"}
        )
        checks.append(_check("search.is2142.status", status == 200, str(status)))
        checks.append(_check("search.is2142.ok", is_body.get("ok") is True, str(is_body.get("error_code"))))
        checks.append(_check("search.is2142.state", "answerability_state" in is_body))
        checks.append(_check("search.is2142.message", isinstance(is_body.get("message_hi"), str)))

        status, unknown = _request(
            port, "POST", "/search", {"query": "scope of this standard", "standard": "IS 99999"}
        )
        msg = str(unknown.get("message_hi") or "")
        checks.append(_check("search.unknown.code", unknown.get("error_code") == "unknown_standard"))
        checks.append(_check("search.unknown.ok", unknown.get("ok") is False))
        checks.append(_check("search.unknown.status", status == 400, str(status)))
        checks.append(_check("search.unknown.no_legacy", "9666" not in msg and "2676" not in msg, msg))
        checks.append(_check("search.unknown.results", unknown.get("results") == []))

        fake.fail_query = True
        status, failed = _request(
            port, "POST", "/search", {"query": "scope of this standard", "standard": "all"}
        )
        blob = json.dumps(failed, ensure_ascii=False)
        checks.append(_check("search.failed.code", failed.get("error_code") == "search_failed", blob))
        checks.append(_check("search.failed.ok", failed.get("ok") is False))
        checks.append(_check("search.failed.status", status == 400, str(status)))
        checks.append(_check("search.failed.no_path", "/Users/" not in blob and "Traceback" not in blob))
        checks.append(_check("search.failed.message", isinstance(failed.get("message_hi"), str)))
    finally:
        httpd.shutdown()
        thread.join(timeout=5)
        httpd.server_close()
        STATE.collection = None
        STATE.standards_cache = None

    checks.extend(_log_message_checks())

    failed = [c for c in checks if not c[1]]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail and not ok else ""))
    print("ALL PASS" if not failed else f"{len(failed)} FAILED")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
