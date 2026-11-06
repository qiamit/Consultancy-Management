#!/usr/bin/env python3
"""Test copy only: real uploaded files are never copied to this Mac, because client documents hold client data.
This puts a small placeholder behind every stored-file record, through the copy's own storage API."""
import os, sys, time, urllib.parse, urllib.request, base64
API = "http://127.0.0.1:54331/storage/v1/object"
KEY = os.environ["SERVICE_KEY"]
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==")
PDF = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
       b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")

def send(req):
    # Right after "tc.sh up" the storage service can still be starting: try a file a few times before calling it failed.
    for wait in (0, 2, 5, 10):
        time.sleep(wait)
        try:
            urllib.request.urlopen(req, timeout=30).read(); return True
        except Exception:
            pass
    return False

ok = bad = 0
for line in sys.stdin:
    bucket, name, mime = (line.rstrip("\n").split("\t") + ["", ""])[:3]
    if not bucket or not name:
        continue
    if mime.startswith("image/"): body, ctype = PNG, "image/png"
    elif mime == "application/pdf" or name.lower().endswith(".pdf"): body, ctype = PDF, "application/pdf"
    else: body, ctype = b"Placeholder on the test copy.\n", mime or "text/plain"
    url = f"{API}/{urllib.parse.quote(bucket)}/{urllib.parse.quote(name)}"
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {KEY}", "apikey": KEY, "Content-Type": ctype, "x-upsert": "true"})
    if send(req): ok += 1
    else: bad += 1
print(f"Placeholders: {ok} written, {bad} failed.")
sys.exit(1 if bad else 0)
