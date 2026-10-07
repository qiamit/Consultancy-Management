"""
Configuration for BIS knowledge indexing.

Paths are read from environment / knowledge_engine/.env.
Do not hard-code machine paths or commit real secrets.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_MODULE_ROOT = Path(__file__).resolve().parent


def _parse_dotenv_file(env_file: Path) -> None:
    """Minimal .env loader (no python-dotenv required for local path setup)."""
    try:
        text = env_file.read_text(encoding="utf-8")
    except OSError:
        return
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if not key:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        # Do not override variables already set in the process environment.
        if key not in os.environ:
            os.environ[key] = value


def _load_dotenv_if_present() -> None:
    """Load knowledge_engine/.env (stdlib parser; python-dotenv optional later)."""
    env_file = _MODULE_ROOT / ".env"
    if not env_file.is_file():
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        _parse_dotenv_file(env_file)
        return
    load_dotenv(env_file, override=False)


def _env_path(name: str) -> Path | None:
    """Read a path env var; expand ~ and resolve to an absolute path."""
    raw = (os.environ.get(name) or "").strip()
    if not raw or raw.startswith("/absolute/path/to/"):
        return None
    return Path(raw).expanduser().resolve()


@dataclass(frozen=True)
class KnowledgeEngineSettings:
    """Resolved settings for PDF sources and vector storage."""

    pdf_source_dir: Path | None
    """Folder of BIS / IS PDF sources (outside the repo)."""

    vector_db_path: Path | None
    """Local vector database / index directory (outside the repo preferred)."""

    client_docs_dir: Path | None
    """Optional client document folder for firm-specific retrieval."""

    module_root: Path = _MODULE_ROOT

    def missing_required_paths(self) -> list[str]:
        """Names of required env vars that are still unset / placeholders."""
        missing: list[str] = []
        if self.pdf_source_dir is None:
            missing.append("KNOWLEDGE_PDF_SOURCE_DIR")
        if self.vector_db_path is None:
            missing.append("KNOWLEDGE_VECTOR_DB_PATH")
        return missing

    def assert_ready_for_indexing(self) -> None:
        """Raise if PDF source or vector path is not configured."""
        missing = self.missing_required_paths()
        if missing:
            raise RuntimeError(
                "Knowledge engine paths not configured. Set these in "
                f"knowledge_engine/.env (from .env.example): {', '.join(missing)}"
            )


def load_settings() -> KnowledgeEngineSettings:
    """Load settings from process environment and optional knowledge_engine/.env."""
    _load_dotenv_if_present()
    return KnowledgeEngineSettings(
        pdf_source_dir=_env_path("KNOWLEDGE_PDF_SOURCE_DIR"),
        vector_db_path=_env_path("KNOWLEDGE_VECTOR_DB_PATH"),
        client_docs_dir=_env_path("KNOWLEDGE_CLIENT_DOCS_DIR"),
    )
