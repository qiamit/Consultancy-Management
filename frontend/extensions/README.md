# Browser extensions (Consultancy Management)

Merged **QE Consultancy** extension (Manak Test Request, IS Code fetch, copy/paste bypass, bulk fill) for this repo:

| Folder | Browser |
|--------|---------|
| [`qe-consultancy-chrome`](qe-consultancy-chrome/) | Chrome, Edge, Brave, and other Chromium browsers |
| [`qe-consultancy-safari`](qe-consultancy-safari/) | Safari 16.4+ (Xcode wrapper in `macos/` and `macos-generated/`) |

**Version:** `2.2.32` (see each folder’s `manifest.json`).

## Allowed app origins

The extension injects `bridge.js` only on Consultancy app pages (not on Manak). Allowed hosts include:

- `http://localhost` / `127.0.0.1` (any port)
- `https://qengineering.in`, `https://www.qengineering.in`, `https://*.qengineering.in`
- `https://*.up.railway.app` and `https://*.railway.app`
- **Consultancy Pro (Railway):** `https://consultancy-production-9720.up.railway.app`
- **Consultancy Management (Railway):** `https://frontend-production-ede6b.up.railway.app`

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
3. **Load unpacked** → select `frontend/extensions/qe-consultancy-chrome`.

The unpacked extension must be removed and loaded again from this path. Chrome gives it a new ID when the folder moves.
4. Open Consultancy Management, use **Open Manak** / IS Code features; allow extension access if prompted.

## Safari

Safari cannot load an unpacked folder like Chrome. Build or open the wrapper from `qe-consultancy-safari/macos-generated` (see [`qe-consultancy-safari/README.md`](qe-consultancy-safari/README.md)):

1. Run the **QE Consultancy Safari** helper app.
2. Safari → **Settings → Advanced** → **Show features for web developers**.
3. **Develop** → **Allow Unsigned Extensions**.
4. **Settings → Extensions** → enable **QE Consultancy Safari Extension** (All Websites when asked).

After editing root `manifest.json` / `background.js`, copy or rebuild into `macos-generated/.../Resources/` before testing in Safari.
