# Playwright PDF Service

Production (Oracle) builds this folder: `deploy/oracle/docker-compose.yml` → service `pdf`, served at `https://<PDF_DOMAIN>/pdf`.

Chromium-based PDF renderer for Qirlpl LIMS reports and certificates.
Produces the same layout as Chrome Print (vector text, print CSS).

## Setup (once)

```bash
npm run pdf:install
```

## Run (alongside Vite)

```bash
npm run pdf:dev
```

Service: `http://127.0.0.1:3847`  
Health: `GET /health`  
PDF: `POST /pdf` with JSON `{ html, filename, format, landscape?, margin? }`

Vite proxies `/api/pdf` → this service during `npm run dev`.

Every `POST /pdf` needs a signed-in user's access token (`Authorization: Bearer …`, sent by
`frontend/web/src/lib/playwrightPdfClient.ts`). For local runs either point the service at an auth server:

```bash
AUTH_URL=http://localhost:<api port>/auth/v1 AUTH_ANON_KEY=<anon key> npm run pdf:dev
```

or, on your own machine only, skip the check: `PDF_AUTH_DISABLED=1 npm run pdf:dev`.

## Security settings (environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_URL`, `AUTH_ANON_KEY` | — | GoTrue base URL and anon key. Without them `/pdf` answers 503. Valid tokens are cached 60 s. |
| `PDF_AUTH_DISABLED` | off | `1` = no sign-in check. Local development only. |
| `PDF_ALLOWED_URL_PREFIXES` | `https://<API_DOMAIN>/storage/v1/object/` | Comma-separated URL prefixes the rendered page may load. `data:`, `blob:` and `about:blank` are always allowed; everything else (other sites, private IPs, `169.254.169.254`, `file:`) is blocked and logged. |
| `ALLOW_LOCALHOST_ORIGINS` | `1` | `0` = browsers on `localhost` / `127.0.0.1` are no longer allowed by CORS. |
| `PDF_MAX_CONCURRENCY` / `PDF_MAX_QUEUE` | `2` / `10` | Renders at once / waiting; more answers 503 "busy". |
| `PDF_RENDER_TIMEOUT_MS` | `30000` | Per-render limit. |
| `PDF_MAX_HTML_BYTES` | `12000000` | HTML size limit (BIS packs embed images as data URLs). |

JavaScript stays enabled in the page: the BIS templates fit and paginate themselves. The container runs as the
unprivileged `pwuser`; Chromium runs with `--no-sandbox` because its sandbox needs user namespaces that Docker's
default seccomp profile blocks (enabling it would mean giving the container `SYS_ADMIN` or a custom seccomp
profile). Errors to the browser are generic and carry a `requestId`; details are in the service log.

## Lab Settings

Print tab → **Direct PDF file (Playwright)** for one-click download.
**Browser print dialog** still uses system Print → Save as PDF.
