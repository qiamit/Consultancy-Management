"""
BIS knowledge indexing scaffold for Consultancy Pro.

Local PDF → chunk → embed → vector store. Source PDFs and the vector index
live outside the git repository; only code + config templates are versioned.
"""

from .config import KnowledgeEngineSettings, load_settings
from .extract_pdf import (
    PdfExtractResult,
    default_diagnostics_dir,
    extract_pdf_hybrid,
    extract_pdf_text,
    render_pdf_pages_png,
    write_extraction_diagnostics,
)

__all__ = [
    "KnowledgeEngineSettings",
    "PdfExtractResult",
    "default_diagnostics_dir",
    "extract_pdf_hybrid",
    "extract_pdf_text",
    "load_settings",
    "render_pdf_pages_png",
    "write_extraction_diagnostics",
]
