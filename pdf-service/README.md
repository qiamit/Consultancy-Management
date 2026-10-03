# Playwright PDF Service

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

## Lab Settings

Print tab → **Direct PDF file (Playwright)** for one-click download.
**Browser print dialog** still uses system Print → Save as PDF.
