"""standards-embed: turns a question into the same 384 numbers the indexer stores for each chunk (BAAI/bge-small-en-v1.5,
local, nothing leaves the server). Internal only: the functions service calls POST /embed {"texts": [...]}."""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from fastembed import TextEmbedding

MODEL = os.environ.get("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
model = TextEmbedding(MODEL, threads=int(os.environ.get("EMBED_THREADS", "1")))


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "model": MODEL})

    def do_POST(self):
        if self.path != "/embed":
            return self._send(404, {"error": "Not Found"})
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if size > 64 * 1024:
                return self._send(413, {"error": "Too Large"})
            texts = [str(t)[:2000] for t in (json.loads(self.rfile.read(size) or b"{}").get("texts") or [])][:8]
            if not texts:
                return self._send(400, {"error": "texts required"})
            vectors = [[round(float(x), 6) for x in v] for v in model.query_embed(texts)]
            self._send(200, {"model": MODEL, "vectors": vectors})
        except Exception as e:  # a bad request never stops the service
            self._send(500, {"error": str(e)[:200]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
