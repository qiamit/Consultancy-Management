# QE Consultancy — Chrome / Edge / Brave

Merged extension: **Manak Test Request** + **Import QR** + **IS Code portal fetch** + **copy/paste bypass** + **bulk fill**.

## Install (employees — use this)

1. Ask Amit for the zip: **`QE-Consultancy-Chrome-2.2.32.zip`**  
   (or copy the folder `frontend/extensions/qe-consultancy-chrome` — **without** any `_metadata` folder inside).

If this extension was already loaded from the old `extensions/` folder, remove that unpacked copy and **Load unpacked** again from `frontend/extensions/qe-consultancy-chrome`. The extension ID changes when the folder moves.
2. Unzip to a simple path, e.g. `C:\QE-Extension\` or `~/QE-Extension/`  
   (avoid Desktop/OneDrive sync folders if Chrome shows errors).
3. Open `chrome://extensions`
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked**.
6. Select the unzipped folder that **directly contains** `manifest.json`  
   (not the parent zip folder, and not a nested extra folder).
7. Pin the extension. Version in the card should show **2.2.32**.

### Common install errors

| Error | Fix |
|-------|-----|
| Manifest file is missing or unreadable | You selected the wrong folder — open until you see `manifest.json` |
| Could not load javascript / file not found | Zip incomplete — re-copy full folder |
| Permissions / policy blocked | Company Chrome policy may block unpacked extensions — ask IT |
| Works for Amit, fails for others | Do **not** share Chrome’s `_metadata` folder; use a fresh zip of source files only |

## Features

- Open / fill BIS Manak Test Request from Consultancy Pro (`🧪`).
- Import Not Used QR codes from Manak Generate QR.
- From IS Code Master, fetch LIMS charges, Manak fees, Product Manuals, BSB Edge PDFs.
- Copy/paste and Ctrl/Cmd shortcuts on sites that try to block them.
- Bulk fill matching fields by name, id, placeholder, or label.

### Manak toggles (important)

- **Default = OFF** for Test Request and Import QR.
- When **OFF**, the extension must **not** auto-fill login, cancel PDF downloads, or redirect Manak pages.
- Only **Copy & Paste** stays available (popup section 1).
- Test Request / Import turn **ON** automatically when you start them from Consultancy Pro, then turn **OFF** when finished.

## Daily use

1. In Consultancy Pro, use **🧪 Generate Test Request** or **Import QR**.
2. Complete captcha on Manak if asked.
3. When finished, toggles go OFF — you can use Manak Online manually (Test Report download etc.).

## Reload after update

`chrome://extensions` → QE Consultancy → **Reload**.
