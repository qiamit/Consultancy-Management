"""
Offline / shadow candidate for v2 standard-filter identity.

NOT wired into live answerability or the API. Production
``compute_signals`` / ``standard_filter_ok`` remain unchanged.

Priority:
1. Non-empty verified-style ``is_number`` metadata
2. Legacy two-sample sample_label mapping (native_text→IS 9666, scanned→IS 2676)
3. Explicit filename ``IS <digits>`` token (provenance: filename_heuristic_unverified)
4. Product ``STD <n>/…`` folder alone → unknown / review_required (never silent IS)

Ambiguous documents stay unknown/review_required.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

Confidence = Literal[
    "verified_metadata",
    "legacy_sample_label",
    "filename_heuristic_unverified",
    "unknown",
    "review_required",
]

_IS_TOKEN_RE = re.compile(r"\bIS\s*[:\-]?\s*(\d+)\b", re.I)
_STD_FOLDER_RE = re.compile(r"^STD\s+(\d+)\b", re.I)

# Known verified legacy sample labels from the two-sample / pilot baseline era.
_LEGACY_SAMPLE_TO_IS = {
    "native_text": "IS 9666",
    "scanned": "IS 2676",
}


@dataclass
class StandardIdentityCandidate:
    """Resolved identity for offline evaluation only."""

    is_number: str | None
    confidence: Confidence
    provenance: list[str] = field(default_factory=list)
    filename_is_token: str | None = None
    std_folder_token: str | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _norm_is(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    m = re.search(r"IS\s*[:\-]?\s*(\d+)", raw, re.I)
    if m:
        return f"IS {m.group(1)}"
    # Already like "9666"?
    if re.fullmatch(r"\d{3,5}", raw):
        return f"IS {raw}"
    return None


def _filename_is_token(rel: str) -> str | None:
    name = Path(rel.replace("\\", "/")).name
    m = _IS_TOKEN_RE.search(name)
    return f"IS {m.group(1)}" if m else None


def _std_folder_token(rel: str) -> str | None:
    parts = Path(rel.replace("\\", "/")).parts
    if not parts:
        return None
    m = _STD_FOLDER_RE.match(parts[0].strip())
    return m.group(1) if m else None


def resolve_standard_identity_v2_candidate(hit: dict[str, Any]) -> StandardIdentityCandidate:
    """
    Shadow resolver. Does not mutate ``hit`` or live answerability.
    """
    rel = str(hit.get("source_relative_path") or "").replace("\\", "/").strip()
    sample = str(hit.get("sample_label") or "").strip()
    meta_raw = hit.get("is_number")
    meta_is = _norm_is(meta_raw if isinstance(meta_raw, str) else None)
    # Treat empty / whitespace as absent
    if isinstance(meta_raw, str) and not meta_raw.strip():
        meta_is = None

    fname_is = _filename_is_token(rel)
    folder_n = _std_folder_token(rel)
    notes: list[str] = []

    # 1) Verified metadata
    if meta_is:
        return StandardIdentityCandidate(
            is_number=meta_is,
            confidence="verified_metadata",
            provenance=["chunk_metadata.is_number"],
            filename_is_token=fname_is,
            std_folder_token=folder_n,
            notes=["Prefer non-empty is_number; not invented from folder."],
        )

    # 2) Legacy sample labels (verified historical mapping for baselines only)
    if sample in _LEGACY_SAMPLE_TO_IS:
        return StandardIdentityCandidate(
            is_number=_LEGACY_SAMPLE_TO_IS[sample],
            confidence="legacy_sample_label",
            provenance=[f"sample_label:{sample}"],
            filename_is_token=fname_is,
            std_folder_token=folder_n,
            notes=["Legacy two-sample label mapping only."],
        )

    # 3) Explicit filename IS token — unverified heuristic with provenance
    if fname_is:
        if folder_n and folder_n != fname_is.replace("IS ", ""):
            notes.append(
                f"STD folder {folder_n} differs from filename {fname_is}; "
                "folder NOT used as IS identity."
            )
        return StandardIdentityCandidate(
            is_number=fname_is,
            confidence="filename_heuristic_unverified",
            provenance=["filename_IS_token"],
            filename_is_token=fname_is,
            std_folder_token=folder_n,
            notes=notes
            or ["Filename IS token only — not verified document metadata."],
        )

    # 4) Folder-only / ambiguous
    if folder_n:
        notes.append(
            f"STD folder {folder_n} present without verified is_number or filename IS token; "
            "do not equate product STD code with PDF IS number."
        )
        return StandardIdentityCandidate(
            is_number=None,
            confidence="review_required",
            provenance=["std_folder_only"],
            filename_is_token=None,
            std_folder_token=folder_n,
            notes=notes,
        )

    return StandardIdentityCandidate(
        is_number=None,
        confidence="unknown",
        provenance=["no_signal"],
        filename_is_token=None,
        std_folder_token=None,
        notes=["No verified or filename IS signal."],
    )


def candidate_standard_filter_ok(
    hit: dict[str, Any],
    selected_standard: str,
    *,
    identity: StandardIdentityCandidate | None = None,
) -> dict[str, Any]:
    """
    Shadow ``standard_filter_ok`` decision for a selected filter.

    Returns ok + reason; never applied to live API.
    """
    std = (selected_standard or "all").strip()
    ident = identity or resolve_standard_identity_v2_candidate(hit)

    if std in ("", "all", "*"):
        return {
            "standard_filter_ok": True,
            "reason": "filter_all",
            "identity": ident.to_dict(),
            "live_wired": False,
        }

    want = _norm_is(std) or std
    # Accept only identities that are not folder-only guesses
    usable_conf = {
        "verified_metadata",
        "legacy_sample_label",
        "filename_heuristic_unverified",
    }
    if ident.confidence in usable_conf and ident.is_number:
        ok = ident.is_number == want
        return {
            "standard_filter_ok": ok,
            "reason": "identity_match" if ok else "identity_mismatch",
            "identity": ident.to_dict(),
            "selected": want,
            "live_wired": False,
        }

    if ident.confidence in ("review_required", "unknown"):
        return {
            "standard_filter_ok": False,
            "reason": f"ambiguous_{ident.confidence}",
            "identity": ident.to_dict(),
            "selected": want,
            "live_wired": False,
        }

    return {
        "standard_filter_ok": False,
        "reason": "unresolved",
        "identity": ident.to_dict(),
        "selected": want,
        "live_wired": False,
    }


def live_standard_filter_ok_snapshot(hit: dict[str, Any], selected_standard: str) -> bool:
    """Mirror of live answerability.compute_signals standard_filter_ok (read-only copy)."""
    sample = (hit.get("sample_label") or "").strip()
    is_no = (hit.get("is_number") or "").strip()
    std = (selected_standard or "all").strip()
    if std == "IS 9666":
        return sample == "native_text" or "9666" in is_no
    if std == "IS 2676":
        return sample == "scanned" or "2676" in is_no
    return True


__all__ = [
    "StandardIdentityCandidate",
    "resolve_standard_identity_v2_candidate",
    "candidate_standard_filter_ok",
    "live_standard_filter_ok_snapshot",
]
