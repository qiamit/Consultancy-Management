"""
Native-text quality checks for hybrid extraction.

Heuristics raise warnings only — they are not proof of accuracy.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass


# Private-use / replacement / common PDF garble markers.
_REPLACEMENT = "\ufffd"
_PUA_RE = re.compile(r"[\ue000-\uf8ff]")
# Devanagari repetition garble seen on IS 9666 cover (CID map fail).
_DEVANAGARI_GARBAGE_RE = re.compile(r"ण{2,}|ि{3,}|्{3,}")
# Legacy scanned digitization noise (IS 2676-style).
_DIGITIZATION_NOISE_RE = re.compile(
    r"(?:DIMI\$|copyzight|SEPTENBER|Eeadqoarters|SHEAJZ|WJDTJ|LENGJ|"
    r"DIMENSIBNS|tlat\b|mmin\b|CZause|TOLE&|Alfernute|Afternate|"
    r"zt\d|lt\d|&N\b)",
    re.I,
)
# Suspicious symbol soup / broken words with $ ! inside letters.
_BROKEN_WORD_RE = re.compile(r"\b[A-Za-z]{0,3}[!$]{1,3}[A-Za-z0-9]{1,8}\b")


@dataclass(frozen=True)
class TextQualityReport:
    text_quality_status: str  # pass | warn | fail
    quality_warnings: list[str]
    replacement_char_count: int
    private_use_char_count: int
    suspicious_token_count: int
    notes: str

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_text_quality(text: str, *, context: str = "") -> TextQualityReport:
    """
    Flag garbled glyphs / CID failures / suspicious digitization.

    Does NOT decide that text is accurate when status is pass —
    visual verification remains separate.
    """
    t = text or ""
    warnings: list[str] = []

    replacement = t.count(_REPLACEMENT)
    pua = len(_PUA_RE.findall(t))
    suspicious = 0

    if replacement:
        warnings.append(f"replacement_chars:{replacement}")
    if pua:
        warnings.append(f"private_use_area_chars:{pua}")

    # Control chars excluding common whitespace.
    controls = sum(
        1
        for ch in t
        if unicodedata.category(ch) == "Cc" and ch not in "\t\n\r"
    )
    if controls:
        warnings.append(f"control_chars:{controls}")

    if _DEVANAGARI_GARBAGE_RE.search(t) or "णिणिणि" in t:
        warnings.append("devanagari_cid_garble")

    noise_hits = _DIGITIZATION_NOISE_RE.findall(t)
    if noise_hits:
        suspicious += len(noise_hits)
        warnings.append(f"digitization_noise:{len(noise_hits)}")

    broken = _BROKEN_WORD_RE.findall(t)
    if broken:
        suspicious += len(broken)
        warnings.append(f"broken_word_tokens:{len(broken)}")

    # High density of isolated punctuation mid-word (OCR/CID artifacts).
    weird_ratio = 0.0
    alnum = sum(1 for ch in t if ch.isalnum())
    if alnum >= 40:
        weird = sum(1 for ch in t if ch in "$<>`�")
        weird_ratio = weird / alnum
        if weird_ratio >= 0.02:
            warnings.append(f"high_weird_glyph_ratio:{weird_ratio:.3f}")

    if context:
        warnings = [f"{w}|ctx={context}" if "|" not in w else w for w in warnings]

    if any(
        w.startswith(
            (
                "devanagari_cid_garble",
                "replacement_chars",
                "private_use_area_chars",
                "digitization_noise",
            )
        )
        or "broken_word_tokens" in w
        for w in warnings
    ):
        status = "fail" if (replacement + pua >= 3 or "devanagari_cid_garble" in "".join(warnings) or suspicious >= 2) else "warn"
    elif warnings:
        status = "warn"
    else:
        status = "pass"

    # Strengthen fail when clear garble markers present.
    joined = " ".join(warnings)
    if "devanagari_cid_garble" in joined or suspicious >= 3 or replacement >= 5:
        status = "fail"

    return TextQualityReport(
        text_quality_status=status,
        quality_warnings=warnings,
        replacement_char_count=replacement,
        private_use_char_count=pua,
        suspicious_token_count=suspicious,
        notes=(
            "Heuristics only — pass is not accuracy proof; "
            "visual_verification is separate."
        ),
    )


def list_tesseract_langs(tesseract_cmd: str) -> list[str]:
    import subprocess

    proc = subprocess.run(
        [tesseract_cmd, "--list-langs"],
        capture_output=True,
        text=True,
        check=False,
    )
    lines = (proc.stdout or proc.stderr or "").splitlines()
    langs: list[str] = []
    for line in lines:
        s = line.strip()
        if not s or s.startswith("List of") or s.startswith("Available"):
            continue
        langs.append(s)
    return langs
