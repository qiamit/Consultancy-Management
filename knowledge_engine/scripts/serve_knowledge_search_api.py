#!/usr/bin/env python3
"""
Local-only BIS knowledge search API (127.0.0.1).

Uses experimental multilingual / pilot collection when present (read-only).
Never deletes/overwrites protected collections.
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
    list_verified_standards,
    open_search_collection,
    run_hybrid_search,
    standard_key,
)

HOST = "127.0.0.1"
PORT = 3851
MAX_LIMIT = 10
DEFAULT_LIMIT = 5
MAX_BODY_BYTES = 32_768
MAX_QUERY_CHARS = 2_000
ALLOWED_CORS_ORIGINS = frozenset(
    {
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    }
)


class SearchState:
    model_name: str = ""
    collection: Any = None
    collection_name: str = ""
    collection_count: int = 0
    persist_dir: str = ""
    error: str | None = None
    standards_cache: list[dict[str, str]] | None = None


STATE = SearchState()


def _safe_error_message(exc: BaseException) -> str:
    """Never leak filesystem paths, secrets, or raw model traces to clients."""
    name = type(exc).__name__
    return f"collection_init_failed:{name}"


def _init_collection() -> None:
    settings = load_settings()
    if settings.vector_db_path is None:
        STATE.error = "config_incomplete"
        return
    try:
        model_name, collection, col_name, persist = open_search_collection(
            settings.vector_db_path
        )
        STATE.model_name = model_name
        STATE.collection = collection
        STATE.collection_name = col_name
        STATE.collection_count = int(collection.count())
        # Do not expose absolute private paths to API clients.
        STATE.persist_dir = f"sample_collections/{col_name}/chroma"
        STATE.error = None
        try:
            STATE.standards_cache = list_verified_standards(collection)
        except Exception:  # noqa: BLE001
            STATE.standards_cache = []
    except Exception as exc:  # noqa: BLE001
        STATE.error = _safe_error_message(exc)
        STATE.collection = None
        STATE.standards_cache = None


def _cors_headers(origin: str | None = None) -> dict[str, str]:
    headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    }
    if origin and origin in ALLOWED_CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    return headers


def _json_bytes(payload: dict[str, Any], *, status: int = 200) -> tuple[int, bytes]:
    return status, (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


def _corpus_banners(col: str, n: int, *, is_pilot: bool) -> dict[str, str]:
    if is_pilot:
        return {
            "banner_en": (
                f"Pilot corpus: {col} — {n} usable chunks. "
                "Not the full BIS library. Protected baseline collections are untouched."
            ),
            "banner_hi": (
                f"पायलट कॉर्पस: {col} — {n} usable अंश। "
                "पूर्ण BIS library नहीं। Protected baseline collections अछूते हैं।"
            ),
            "disclaimer_hi": (
                f"पायलट खोज: {col} के {n} usable अंश। "
                "यह पूर्ण BIS library नहीं है। Protected baseline collections अछूते हैं।"
            ),
        }
    return {
        "banner_en": f"Test corpus: {col} — {n} usable chunks.",
        "banner_hi": f"परीक्षण कॉर्पस: {col} — {n} usable अंश।",
        "disclaimer_hi": f"परीक्षण कॉर्पस: {col} — {n} usable अंश।",
    }


def run_search(*, query: str, standard: str, limit: int) -> dict[str, Any]:
    if STATE.collection is None:
        return {
            "ok": False,
            "error_code": "service_unavailable",
            "message_hi": "स्थानीय ज्ञान खोज सेवा तैयार नहीं है।",
            "detail": STATE.error or "service_unavailable",
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }

    q = (query or "").strip()
    if len(q) > MAX_QUERY_CHARS:
        return {
            "ok": False,
            "error_code": "query_too_long",
            "message_hi": "सवाल बहुत लंबा है।",
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }

    limit = max(1, min(int(limit or DEFAULT_LIMIT), MAX_LIMIT))
    std = standard_key(standard)
    try:
        payload = run_hybrid_search(
            collection=STATE.collection,
            query=q,
            standard=std,
            limit=limit,
        )
    except Exception:  # noqa: BLE001
        # VDB-19: collection.get / query failures must not leak paths or tracebacks.
        return {
            "ok": False,
            "error_code": "search_failed",
            "message_hi": "खोज पूरी नहीं हो सकी। कृपया दोबारा कोशिश करें।",
            "answerability_state": "not_found",
            "results": [],
            "evidence_chunks": [],
        }
    payload["collection"] = STATE.collection_name
    payload["usable_chunk_total"] = STATE.collection_count
    payload["model_name"] = STATE.model_name
    is_pilot = "pilot" in (STATE.collection_name or "").lower()
    payload["corpus_mode"] = "pilot" if is_pilot else "baseline_test"
    if STATE.collection_name:
        payload.update(
            _corpus_banners(STATE.collection_name, STATE.collection_count, is_pilot=is_pilot)
        )
    payload.setdefault("answerability_state", "not_found")
    payload.setdefault("evidence_reasons", [])
    payload.setdefault("evidence_chunks", [])
    payload.setdefault("signals_summary", {})
    payload.setdefault("debug_scores", {})
    return payload


def build_standards_payload() -> dict[str, Any]:
    standards = [{"id": "all", "label": "All standards (current corpus)"}]
    cached = list(STATE.standards_cache or [])
    if not cached and STATE.collection is not None:
        try:
            cached = list_verified_standards(STATE.collection)
            STATE.standards_cache = cached
        except Exception:  # noqa: BLE001
            cached = []
    standards.extend(cached)
    col = STATE.collection_name or ""
    n = STATE.collection_count
    is_pilot = "pilot" in col.lower()
    banners = _corpus_banners(col, n, is_pilot=is_pilot) if col else {}
    return {
        "ok": True,
        "collection": col,
        "usable_chunk_total": n,
        "corpus_mode": "pilot" if is_pilot else "baseline_test",
        "standards": standards,
        "modes_note_en": (
            "Choosing one IS keeps other standards out of the candidate set. "
            "“All” is a separate mode over the current corpus."
        ),
        "modes_note_hi": (
            "IS चुनने पर दूसरे standards candidate set में नहीं आते। "
            "«सभी» वर्तमान कॉर्पस पर अलग mode है।"
        ),
        **banners,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "BisKnowledgeSearch/1.2"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Method + status only. Never interpolate the request line (it can hold the query).
        status: Any = "-"
        if len(args) >= 2:
            status = args[1]
        elif len(args) == 1:
            try:
                status = fmt % args
            except (TypeError, ValueError):
                status = args[0]
        method = getattr(self, "command", None) or "-"
        sys.stderr.write("%s - %s %s\n" % (self.address_string(), method, status))

    def _origin(self) -> str | None:
        return self.headers.get("Origin")

    def _send(self, status: int, body: bytes) -> None:
        self.send_response(status)
        for k, v in _cors_headers(self._origin()).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self._origin()
        if origin and origin not in ALLOWED_CORS_ORIGINS:
            self._send(403, b'{"ok":false,"error_code":"cors_denied"}\n')
            return
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
                health.update(_corpus_banners(col, n, is_pilot=is_pilot))
            status, body = _json_bytes(
                health,
                status=200 if STATE.collection is not None else 503,
            )
            self._send(status, body)
            return

        if path in ("/standards", "/api/knowledge/standards"):
            status, body = _json_bytes(build_standards_payload())
            self._send(status, body)
            return

        if path in ("/search", "/api/knowledge/search"):
            qs = parse_qs(parsed.query)
            query = (qs.get("q") or qs.get("query") or [""])[0]
            if len(query) > MAX_QUERY_CHARS:
                status, body = _json_bytes(
                    {"ok": False, "error_code": "query_too_long", "message_hi": "सवाल बहुत लंबा है।"},
                    status=400,
                )
                self._send(status, body)
                return
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
            {"ok": False, "message_hi": "अज्ञात पथ।", "error_code": "not_found"},
            status=404,
        )
        self._send(status, body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path not in ("/search", "/api/knowledge/search"):
            status, body = _json_bytes(
                {"ok": False, "message_hi": "अज्ञात पथ।", "error_code": "not_found"},
                status=404,
            )
            self._send(status, body)
            return

        try:
            length = int(self.headers.get("Content-Length") or "0")
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY_BYTES:
            status, body = _json_bytes(
                {"ok": False, "error_code": "body_too_large", "message_hi": "अनुरोध बहुत बड़ा है।"},
                status=413,
            )
            self._send(status, body)
            return

        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            status, body = _json_bytes(
                {"ok": False, "message_hi": "अमान्य JSON।", "error_code": "invalid_json"},
                status=400,
            )
            self._send(status, body)
            return

        if not isinstance(data, dict):
            status, body = _json_bytes(
                {"ok": False, "error_code": "invalid_json", "message_hi": "अमान्य JSON।"},
                status=400,
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
