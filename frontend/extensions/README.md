# Browser extension (Consultancy Management)

Single **QE Consultancy** Chromium extension (Manak Test Request, IS Code fetch, copy/paste bypass, bulk fill, Manak Assist):

| Folder | Browser |
|--------|---------|
| [`QE-Extension-Dev`](QE-Extension-Dev/) | Chrome, Edge, Brave, and other Chromium browsers |

Safari / Xcode copies were removed (2026-10-23). Use Chromium only.

**Version:** `2.7.6` (see `QE-Extension-Dev/manifest.json`).

## Allowed app origins

The extension injects `bridge.js` only on Consultancy app pages (not on Manak). Allowed hosts include:

- `http://localhost` / `127.0.0.1` (any port)
- `https://qengineering.in`, `https://www.qengineering.in`, `https://*.qengineering.in`

Manak / BIS portal content scripts are unchanged: `manakonline.in`, `lims.bis.gov.in`, `standards.bis.gov.in`, `standardsbis.bsbedge.com`.

The app passes `returnUrl` at runtime for PDF upload; no API secrets live in the extension.

## Manak PDF API

Browser extensions upload Manak test-request PDFs to the Railway functions service:

- **Production:** `https://api-production-a87f8.up.railway.app/api/osl/manak-pdf`
- **Local / app config:** `${VITE_SUPABASE_URL}/functions/v1/osl/manak-pdf` (same gateway path the Consultancy frontend uses)

Poll with `GET ?token=…` until `{ ready: true }`, then fetch the PDF from the returned `ref`.

## Chrome — load unpacked

1. Open `chrome://extensions` (or Edge `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select `frontend/extensions/QE-Extension-Dev`.

If an older unpacked copy pointed at `qe-consultancy-chrome` or `qe-consultancy-safari`, remove it and load this folder again. The extension ID changes when the folder moves.

4. Open Consultancy Management, use **Open Manak** / IS Code / Manak Assist features; allow extension access if prompted.
