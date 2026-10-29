# Browser extension (Consultancy Management)

Single **QE Consultancy** Chromium extension (Manak Test Request, IS Code fetch, copy/paste bypass, bulk fill, Manak Assist):

| Folder | Browser |
|--------|---------|
| [`QE-Extension-Dev`](QE-Extension-Dev/) | Chrome, Edge, Brave, and other Chromium browsers |

Safari / Xcode copies were removed (2026-10-23). Use Chromium only.

**Version:** `2.7.7` (see `QE-Extension-Dev/manifest.json`).

## Allowed app origins

The extension injects `bridge.js` only on Consultancy app pages (not on Manak). Allowed hosts include:

- `http://localhost` / `127.0.0.1` (any port)
- `https://qengineering.in`, `https://www.qengineering.in`

Background sends Manak results / PDFs only to tabs whose hostname is exactly one of these (checked before every send).

Manak / BIS portal content scripts are unchanged: `manakonline.in`, `lims.bis.gov.in`, `standards.bis.gov.in`, `standardsbis.bsbedge.com`.

The app passes `returnUrl` at runtime for PDF upload; no API secrets live in the extension. The extension accepts only `https://api.qengineering.in` (or `http://localhost:*` / `127.0.0.1:*` in dev) as `returnUrl`, and opens login pages only on `manakonline.in`.

## Manak PDF API

Browser extensions upload Manak test-request PDFs to the functions service behind the API gateway:

- **Production:** `https://api.qengineering.in/api/osl/manak-pdf`
- **Local / app config:** `${VITE_SUPABASE_URL}/api/osl/manak-pdf` (same gateway path the Consultancy frontend uses)

The extension uploads once per hand-off token (`chunk` × N → `finish`, 3 tries with backoff each) and then forgets the token. The app polls with `GET ?token=…` until `{ ready: true }`, and confirms attach back to the extension (`QE_MANAK_RESULT_ACK`), which then drops its stored copy of the PDF.

## Chrome — load unpacked

1. Open `chrome://extensions` (or Edge `edge://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select `frontend/extensions/QE-Extension-Dev`.

If an older unpacked copy pointed at `qe-consultancy-chrome` or `qe-consultancy-safari`, remove it and load this folder again. The extension ID changes when the folder moves.

4. Open Consultancy Management, use **Open Manak** / IS Code / Manak Assist features; allow extension access if prompted.
