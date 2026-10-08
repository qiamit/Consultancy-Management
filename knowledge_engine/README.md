# BIS knowledge engine — Consultancy Pro
#
# Local RAG scaffold for indexing BIS / IS PDFs and (later) client documents.
# This module is intentionally separate from Railway Node functions and the
# Vite frontend: PDF parsing + vector stores run on a workstation / CI job.

## Status (initial setup only)

- Configuration + `.env.example` placeholders: done
- Dependencies: listed in `requirements.txt` but **not** installed yet
- Bulk indexing: **not** started
- PDFs / client docs: stay **outside** the git repo (never copy them here)

## Layout

```
knowledge_engine/
├── .env.example
├── requirements.txt
├── __init__.py
├── config.py
├── extract_pdf.py            # page-wise PDF text (PyMuPDF)
├── scripts/extract_sample.py # sample extract CLI
├── diagnostics/              # local extract outputs (gitignored)
└── README.md
```

### Sample text extraction

```bash
# from repo root (after venv + pymupdf install)
./knowledge_engine/.venv/bin/python -m knowledge_engine.scripts.extract_sample \
  "STD 9666/IS 9666 2023 - 00.pdf" \
  --render-pages "1,3,5,8,9,10"
```

Outputs land in `KNOWLEDGE_VECTOR_DB_PATH/diagnostics/` (outside the repo). No embeddings, OCR bulk jobs beyond sample hybrid extract, or indexing.

### Two-sample hybrid extract (native → Tesseract)

```bash
export PATH="./knowledge_engine/.conda/bin:$PATH"
./knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.extract_two_samples
```

Requires a local Tesseract binary (project-local micromamba env under `knowledge_engine/.conda` is supported).

## Setup (when you are ready)

1. Copy `.env.example` to `.env`.
2. Set absolute paths (examples — use your real folders):

   - `KNOWLEDGE_PDF_SOURCE_DIR` — BIS PDF library on disk / NAS
   - `KNOWLEDGE_VECTOR_DB_PATH` — local folder for the vector index
   - `KNOWLEDGE_CLIENT_DOCS_DIR` — optional client document root

3. Create a venv and install deps (later):

   ```bash
   cd knowledge_engine
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

4. Indexing / query CLI will be added in a follow-up; do not run bulk jobs yet.

## Rules

- Do not commit `.env`, `.venv/`, or any vector index files.
- Do not copy BIS PDFs or client documents into this repository.
- Prefer storing the vector DB outside the repo tree when possible.

## Reuse in another app

Run the API from the repo root (`npm run knowledge:api`, or `knowledge_engine/.conda/bin/python -m knowledge_engine.scripts.serve_knowledge_search_api`). Call it over HTTP at `127.0.0.1:3851`. The contract is in `API.md`. Do not import `knowledge_engine` from another application's frontend or backend.

A later extraction can use `git subtree split --prefix=knowledge_engine`.

## Recreate .conda

The env has an absolute prefix. If this folder ever moves, recreate the env. Do not move `.conda`. From inside `knowledge_engine/`:

```bash
./.tools/bin/micromamba create -y -p "$(pwd)/.conda" -c conda-forge tesseract python=3.11 pip && ./.conda/bin/python -m pip install -r requirements-conda.lock.txt
```
