#!/usr/bin/env python3
"""Writes the test copy's own settings, test password and Vault root key to deploy/test-copy/local/.
Prints no values. Every key is new: nothing comes from the server, so a key here opens nothing on the live app."""
import base64, hashlib, hmac, json, os, secrets, time
HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(HERE, "local")
ENV = os.path.join(LOCAL, ".env")
PW = os.path.join(LOCAL, "test-password.txt")
ROOT_KEY = os.path.join(LOCAL, "pgsodium_root.key")
os.makedirs(LOCAL, mode=0o700, exist_ok=True)
if os.path.exists(ENV):
    raise SystemExit("Settings already exist; nothing changed.")

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def jwt(secret, role):
    head = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    now = int(time.time())
    body = b64(json.dumps({"role": role, "iss": "qe-test-copy", "iat": now, "exp": now + 10 * 365 * 86400},
                          separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{b64(sig)}"

jwt_secret = secrets.token_hex(32)
values = {
    "TEST_COPY": "qe",
    # Used by deploy/oracle/docker-compose.yml; the test copy's own addresses are set in compose.override.yml.
    "APP_DOMAIN": "test-copy.invalid", "API_DOMAIN": "test-copy.invalid", "MCP_DOMAIN": "test-copy.invalid",
    "PDF_DOMAIN": "test-copy.invalid", "ACME_EMAIL": "test-copy@example.test",
    "POSTGRES_PASSWORD": secrets.token_hex(24), "JWT_SECRET": jwt_secret, "JWT_EXPIRY": "3600",
    "ANON_KEY": jwt(jwt_secret, "anon"), "SERVICE_ROLE_KEY": jwt(jwt_secret, "service_role"),
    "MCP_TOKEN_KEY": secrets.token_hex(32), "MCP_ENABLED": "true", "MCP_WRITE_ENABLED": "false",
    "GOTRUE_DISABLE_SIGNUP": "true", "GOTRUE_PASSWORD_MIN_LENGTH": "8",
    # Email off: no provider key, and the sign-in service's mail goes nowhere.
    "RESEND_API_KEY": "", "GOTRUE_SMTP_HOST": "",
    "ALLOW_LOCALHOST_ORIGINS": "1", "RENEWAL_REMINDERS_DISABLED": "1", "CUSTOMER_PORTAL_INVITES": "0",
}
fd = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    f.writelines(f"{k}={v}\n" for k, v in values.items())
fd = os.open(PW, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("Test" + secrets.token_hex(8) + "\n")
# Vault root key of this copy only. The database reads it as another user, so it is readable on this Mac only.
fd = os.open(ROOT_KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
with os.fdopen(fd, "w") as f:
    f.write(secrets.token_hex(32))
print("Settings written. No values shown.")
