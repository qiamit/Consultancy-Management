# Consultancy Pro → Oracle Cloud (Always Free)

Consultancy Management (QE Consultancy) को Railway से एक Oracle Cloud server पर ले जाने का पूरा kit।
बाकी apps (LIMS, Accounting, Finance, Metallurgy, BIS Record) Railway पर ही रहेंगी।

```
Internet ─► Caddy (HTTPS, अपने-आप certificate)
              ├─ qengineering.in, www          → web app (Vite build)
              ├─ api.qengineering.in           → auth (GoTrue) / rest (PostgREST) / storage / functions
              ├─ mcp.qengineering.in           → MCP server
              └─ pdf.qengineering.in           → PDF service (Chrome)
                         सब ─► Postgres 17.6 (same as Railway)  +  files server की disk पर
```

Server: Ampere A1 (ARM64), 2 OCPU, 12 GB RAM, 150–200 GB disk, Ubuntu 24.04।
Versions Railway जैसे ही हैं: Postgres `supabase/postgres:17.6.1.136`, GoTrue `v2.174.0`, PostgREST `v12.2.12`,
storage-api `v1.24.7` — इसलिए data जैसा का तैसा आ जाता है। सभी images ARM64 पर चलती हैं।

## Files

| File | काम |
| --- | --- |
| `docker-compose.yml` | db, auth, rest, storage, functions, mcp, pdf, caddy |
| `Caddyfile` | HTTPS, web app, API routes + CORS (Railway gateway जैसा) |
| `env.template` | `.env` में कौन-कौन सी settings हैं (असली `.env` कभी commit नहीं होता) |
| `db/roles.sql` | Supabase roles के passwords |
| `scripts/server-bootstrap.sh` | नए server का एक बार setup (Docker, firewall, swap, updates, fail2ban, backup cron) |
| `scripts/make-env-from-railway.mjs` | Mac पर: Railway से secrets लेकर `.env` बनाता है (वही JWT secret → logins/keys/extension चलते रहें) |
| `scripts/deploy.sh` | Server पर: latest main, web build, containers, DB migrations |
| `scripts/migrate-db.sh` | Railway DB → Oracle (Railway सिर्फ़ पढ़ा जाता है) + हर table की row गिनती मिलाना |
| `scripts/migrate-storage.mjs` | Railway bucket की files → server disk (resume हो सकता है) + जाँच |
| `scripts/backup.sh` | रोज़ रात DB backup (14 दिन), हर रविवार files snapshot (4 हफ़्ते), encrypted copy Object Storage में |
| `.github/workflows/deploy-oracle.yml` | GitHub से deploy (cutover के बाद हर merge पर अपने-आप) |

## Phase 0 — आपका काम (Oracle account)

1. oracle.com/cloud/free पर account, Home Region **Mumbai / Hyderabad**।
2. **Pay As You Go** में upgrade (free limit में ₹0) + Budget alert ₹100।
3. Instance: Ubuntu 24.04 (aarch64), **VM.Standard.A1.Flex 2 OCPU / 12 GB**, public IP, boot volume 150 GB,
   SSH public key = Mac की `~/.ssh/qe_oracle.pub`।
4. Security List में TCP **80, 443** खोलें।
5. Public IP बताएँ।

## Phase 1 — Server setup (मैं करूँगा)

```bash
# Mac से
ssh -i ~/.ssh/qe_oracle ubuntu@<IP>
# server पर (repo आने से पहले script अकेली copy होती है)
bash server-bootstrap.sh          # GitHub deploy key दिखाएगा → GitHub में read-only जोड़ें → script दोबारा
# Mac पर: test नाम (app.<IP>.sslip.io …) के साथ .env
node deploy/oracle/scripts/make-env-from-railway.mjs --ip <IP>
scp -i ~/.ssh/qe_oracle deploy/oracle/.env ubuntu@<IP>:/opt/qe/app/deploy/oracle/.env
# server पर
bash /opt/qe/app/deploy/oracle/scripts/deploy.sh
```

## Phase 2 — Data copy और test (Railway चलता रहेगा)

```bash
bash /opt/qe/app/deploy/oracle/scripts/migrate-db.sh              # DB copy + row गिनती मिलान
cd /opt/qe/app/deploy/oracle/scripts && npm ci
node migrate-storage.mjs --check-layout                           # test file से path की पुष्टि
node migrate-storage.mjs                                          # 3.8 GB files (बीच में रुके तो दोबारा चलाएँ)
node migrate-storage.mjs --verify                                 # हर file disk पर + 25 random files API से
```

फिर browser में `https://app.<IP-dashes>.sslip.io` खोलकर पूरा app test करें (login, documents, PDF, uploads)।
Renewal reminders यहाँ बंद रहते हैं (`RENEWAL_REMINDERS_DISABLED=1`) ताकि दो जगह से mail न जाए।

## Phase 3 — Cutover (रात में, ~30–60 मिनट)

1. Railway पर functions में `RENEWAL_REMINDERS_DISABLED=1`।
2. Data दोबारा copy: `migrate-db.sh` (पूरा) + `migrate-storage.mjs` (सिर्फ़ नई files) + `--verify`।
3. Mac पर: `make-env-from-railway.mjs --domain qengineering.in` → `.env` server पर → `deploy.sh`।
4. DNS (domain registrar पर): `qengineering.in`, `www`, `api`, `mcp`, `pdf` → A record = Oracle IP
   (Railway वाले CNAME हटाएँ)। Caddy अपने-आप certificates ले लेगा।
5. Test: login, documents, PDF download, file upload/view, MCP, QE extension।
6. GitHub secrets `ORACLE_HOST`, `ORACLE_SSH_KEY` डालें, workflow में `push` चालू करें।
   साथ में `ORACLE_KNOWN_HOSTS` भी डालें (`ssh-keyscan -t ed25519 <ORACLE_HOST>` की line; fingerprint server पर
   `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` से मिलाएँ) — तब workflow सिर्फ़ इसी server key पर चलेगा।
7. Railway की Consultancy services 1 हफ़्ते तक fallback के लिए रखें, फिर बंद करें (आपकी मंज़ूरी से)।

**Rollback:** DNS को वापस Railway पर कर दें — Railway का data cutover तक का है।

## रोज़ का काम

- कुछ नहीं। Security updates अपने-आप (unattended-upgrades), backups रोज़ 02:30 IST।
- महीने में एक बार: `sudo apt upgrade` + `docker compose pull` (मैं कर दूँगा)।
- Site बंद होने पर alert के लिए UptimeRobot (free) लगाएँ।

## Backups (server के बाहर)

- Bucket `qe-backups` (Hyderabad, Object Storage), rclone remote `ociqe:` (S3 Customer Secret Key) के ऊपर
  encrypted remote `ociqe-crypt:` — bucket में नाम और data दोनों encrypted हैं। `.env`: `BACKUP_RCLONE_REMOTE=ociqe-crypt:qe`।
- हर रात: DB dump + xattrs list → `qe/db/` (30 दिन)। Files → `qe/files/` (sync); बदली/हटाई files
  `qe/files-old/<तारीख>/` में 60 दिन रहती हैं।
- Vault root key `/opt/qe/secrets/pgsodium_root.key` (db container में mount) → `qe/keys/`। Manak passwords,
  AI keys और email secrets की key Vault में इसी root key से encrypted है — dump अकेला कुछ नहीं खोल सकता।
- **Encryption passphrase** सिर्फ़ owner के पास (password manager) — उसके बिना off-site copy नहीं खुलेगी।
  Server खो जाए तो: नए server पर `rclone config` से `ociqe` (नई Customer Secret Key) और `ociqe-crypt`
  (वही passphrase) बनाएँ।

Restore (नए / खाली server पर, app बंद करके; db container चलाने से **पहले** root key वापस रखें):

```bash
sudo rclone --config ~/.config/rclone/rclone.conf copy ociqe-crypt:qe/keys/pgsodium_root.key /opt/qe/secrets/
sudo chown 100:101 /opt/qe/secrets/pgsodium_root.key && sudo chmod 400 /opt/qe/secrets/pgsodium_root.key
rclone copy ociqe-crypt:qe/db/qe-<stamp>.dump /opt/qe/backups/db/
docker compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists < /opt/qe/backups/db/qe-<stamp>.dump
sudo rclone --config ~/.config/rclone/rclone.conf copy ociqe-crypt:qe/files /opt/qe/data/storage
rclone cat ociqe-crypt:qe/db/xattrs-<stamp>.txt.gz | gunzip > /tmp/xattrs.txt
cd /opt/qe/data && sudo setfattr --restore=/tmp/xattrs.txt
```

## Two-Step Login break-glass (दोनों admins का phone खो जाए)

Admins को हर login पर password + authenticator app का 6-digit code चाहिए (migration
`20261030120000_admin_mfa_aal2.sql`). एक admin का phone खोए तो दूसरा admin app में:
Settings → User Management → उस user की row → **Reset Two-Step Login** (shield icon).

दोनों admins के phone खो जाएँ, तभी यह करें (Mac से, server पर):

```bash
ssh -i ~/.ssh/qe_oracle ubuntu@129.225.118.1
cd /opt/qe/app/deploy/oracle

# 1) admin का user id देखें
docker compose --env-file .env exec -T db psql -U supabase_admin -d postgres -c \
  "select id, email from public.user_profiles where role = 'admin';"

# 2) सिर्फ़ उसी एक admin के factors हटाएँ और उसे हर जगह से sign out करें (<ADMIN_ID> बदलें)
docker compose --env-file .env exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "
BEGIN;
DELETE FROM auth.mfa_factors WHERE user_id = '<ADMIN_ID>';
DELETE FROM auth.sessions    WHERE user_id = '<ADMIN_ID>';
INSERT INTO public.audit_log (table_name, row_id, action, changed_via, new_data)
VALUES ('auth.users', '<ADMIN_ID>', 'U', 'break-glass', jsonb_build_object('event', 'mfa_reset_break_glass'));
COMMIT;"
```

(`auth.mfa_challenges` और `auth.mfa_amr_claims` cascade से हट जाते हैं.)
फिर वह admin password से sign in करे → app खुद authenticator setup (QR) दिखाएगा → नया phone scan करें.
उसके बाद वही admin दूसरे admin का **Reset Two-Step Login** app से करे.
`role = 'admin'` या `app_is_admin()` को कभी न बदलें — सिर्फ़ factors हटाने हैं.

## Customer Portal (licensee login)
- Customers sign in at `/portal` (invite only) and see only the licences assigned to them, read-only. Admins manage
  logins from Client Master → row button **Customer Portal**: invite, choose licences, switch off, and tick the files
  shown to the customer.
- The database locks a `customer` login out of every table (restrictive policy `customer_lockout`); customers read only
  through the `portal_*` functions. A table added later gets the lockout automatically after `db:migrate`.
- Invites stay off until `.env` has `CUSTOMER_PORTAL_INVITES=1`. Turn it on only after Railway is shut down and the
  secrets are rotated, then `docker compose up -d functions`.
- Isolation test (on a copy of the database, never needed on live): it makes two test customers in a transaction,
  checks that neither can read anything else, and rolls back.
  ```
  docker compose --env-file .env exec -T db psql -U supabase_admin -d <copy> -v ON_ERROR_STOP=1 -f - < ../../backend/database/tests/portal_isolation.sql
  ```
