#!/usr/bin/env python3
"""
Local-only BIS knowledge search API (127.0.0.1).

Uses experimental multilingual collection when present (read-only).
Never deletes/overwrites production bis_two_sample_usable_v1.
No DeepSeek answers, no bulk indexing.

Example:
  knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.serve_knowledge_search_api
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

_REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from knowledge_engine.config import load_settings
from knowledge_engine.search_pipeline import (
    open_search_collection,
    run_hybrid_search,
    standard_key,
)

HOST = "127.0.0.1"
PORT = 3851
MAX_LIMIT = 10
DEFAULT_LIMIT = 5


class SearchState:
    model_name: str = ""
    collection: Any = None
    collection_name: str = ""
    collection_count: int = 0
    persist_dir: str = ""
    error: str | None = None


STATE = SearchState()


def _init_collection() -> None:
    settings = load_settings()
    if settings.vector_db_path is None:
        STATE.error = "KNOWLEDGE_VECTOR_DB_PATH unset"
        return
    try:
        model_name, collection, col_name, persist = open_search_collection(
            settings.vector_db_path
        )
        STATE.model_name = model_name
        STATE.collection = collection
        STATE.collection_name = col_name
        STATE.collection_count = int(collection.count())
        STATE.persist_dir = str(persist)
        STATE.error = None
    except Exception as exc:  # noqa: BLE001
        STATE.error = str(exc)
        STATE.collection = None


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    }


def _json_bytes(payload: dict[str, Any], *, status: int = 200) -> tuple[int, bytes]:
    return status, (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


def run_search(*, query: str, standard: str, limit: int) -> dict[str, Any]:
    if STATE.collection is None:
        return {
            "ok": False,
            "error_code": "service_unavailable",
            "message_hi": "स्थानीय ज्ञान खोज सेवा तैयार नहीं है।",
            "detail": STATE.error,
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }

    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    std = standard_key(standard)
    payload = run_hybrid_search(
        collection=STATE.collection,
        query=query,
        standard=std,
        limit=limit,
    )
    payload["collection"] = STATE.collection_name
    payload["usable_chunk_total"] = STATE.collection_count
    payload["model_name"] = STATE.model_name
    is_pilot = "pilot" in (STATE.collection_name or "").lower()
    payload["corpus_mode"] = "pilot" if is_pilot else "baseline_test"
    if is_pilot:
        col = STATE.collection_name or "pilot"
        n = STATE.collection_count
        payload["disclaimer_hi"] = (
            f"पायलट खोज: {col} के {n} usable अंश। "
            "यह पूर्ण BIS library नहीं है। Protected baseline collections अछूते हैं।"
        )
        payload["banner_en"] = (
            f"Pilot corpus: {col} — {n} usable chunks. "
            "Not the full BIS library. Protected baseline collections are untouched."
        )
        payload["banner_hi"] = (
            f"पायलट कॉर्पस: {col} — {n} usable अंश। "
            "पूर्ण BIS library नहीं। Protected baseline collections अछूते हैं।"
        )
    # Ensure contract keys always present
    payload.setdefault("answerability_state", "not_found")
    payload.setdefault("evidence_reasons", [])
    payload.setdefault("evidence_chunks", [])
    payload.setdefault("signals_summary", {})
    payload.setdefault("debug_scores", {})
    return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "BisKnowledgeSearch/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes) -> None:
        self.send_response(status)
        for k, v in _cors_headers().items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        if path in ("/health", "/api/knowledge/health"):
            is_pilot = "pilot" in (STATE.collection_name or "").lower()
            col = STATE.collection_name or ""
            n = STATE.collection_count
            health: dict[str, Any] = {
                "ok": STATE.collection is not None,
                "host": HOST,
                "port": PORT,
                "collection": col,
                "usable_chunk_total": n,
                "model_name": STATE.model_name,
                "corpus_mode": "pilot" if is_pilot else "baseline_test",
                "error": STATE.error,
                "message_hi": (
                    "स्थानीय ज्ञान खोज सेवा चालू है।"
                    if STATE.collection is not None
                    else "स्थानीय ज्ञान खोज सेवा बंद है या collection नहीं मिला।"
                ),
            }
            if STATE.collection is not None and col:
                health["banner_en"] = (
                    f"Pilot corpus: {col} — {n} usable chunks. "
                    "Not the full BIS library. Protected baseline collections are untouched."
                    if is_pilot
                    else f"Test corpus: {col} — {n} usable chunks."
                )
                health["banner_hi"] = (
                    f"पायलट कॉर्पस: {col} — {n} usable अंश। "
                    "पूर्ण BIS library नहीं। Protected baseline collections अछूते हैं।"
                    if is_pilot
                    else f"परीक्षण कॉर्पस: {col} — {n} usable अंश।"
                )
            status, body = _json_bytes(
                health,
                status=200 if STATE.collection is not None else 503,
            )
            self._send(status, body)
            return

        if path in ("/standards", "/api/knowledge/standards"):
            status, body = _json_bytes(
                {
                    "ok": True,
                    "standards": [
                        {"id": "all", "label": "सभी (दोनों परीक्षण standards)"},
                        {"id": "IS 9666", "label": "IS 9666 : 2023"},
                        {"id": "IS 2676", "label": "IS 2676 : 1981"},
                    ],
                    "modes_note_hi": (
                        "IS 9666 या IS 2676 चुनने पर दूसरे standard के अंश candidate set में नहीं आते। "
                        "‘सभी’ अलग mode है।"
                    ),
                    "disclaimer_hi": (
                        "परीक्षण: केवल दो standards के 19 जाँचे हुए अंश उपलब्ध हैं। "
                        "यह पूरे standard की पूर्ण खोज नहीं है।"
                    ),
                }
            )
            self._send(status, body)
            return

        if path in ("/search", "/api/knowledge/search"):
            qs = parse_qs(parsed.query)
            query = (qs.get("q") or qs.get("query") or [""])[0]
            standard = (qs.get("standard") or ["all"])[0]
            try:
                limit = int((qs.get("limit") or [str(DEFAULT_LIMIT)])[0])
            except ValueError:
                limit = DEFAULT_LIMIT
            payload = run_search(query=query, standard=standard, limit=limit)
            status, body = _json_bytes(payload, status=200 if payload.get("ok") else 400)
            self._send(status, body)
            return

        status, body = _json_bytes(
            {"ok": False, "message_hi": "अज्ञात पथ।", "path": path},
            status=404,
        )
        self._send(status, body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path not in ("/search", "/api/knowledge/search"):
            status, body = _json_bytes(
                {"ok": False, "message_hi": "अज्ञात पथ।"}, status=404
            )
            self._send(status, body)
            return

        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            status, body = _json_bytes(
                {"ok": False, "message_hi": "अमान्य JSON।"}, status=400
            )
            self._send(status, body)
            return

        query = str(data.get("query") or data.get("q") or "")
        standard = str(data.get("standard") or "all")
        try:
            limit = int(data.get("limit") or DEFAULT_LIMIT)
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT

        payload = run_search(query=query, standard=standard, limit=limit)
        status, body = _json_bytes(payload, status=200 if payload.get("ok") else 400)
        self._send(status, body)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Local BIS knowledge search API")
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args(argv)

    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print(
            "ERROR: This API must bind only to localhost (127.0.0.1).",
            file=sys.stderr,
        )
        return 2

    _init_collection()
    if STATE.error:
        print(f"WARN: collection init: {STATE.error}", file=sys.stderr)
    else:
        print(
            f"Opened collection {STATE.collection_name!r} "
            f"({STATE.collection_count} chunks, model={STATE.model_name})",
            file=sys.stderr,
        )

    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(
        f"BIS knowledge search API on http://{args.host}:{args.port} "
        f"(health: /health, search: POST /search)",
        file=sys.stderr,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", file=sys.stderr)
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
