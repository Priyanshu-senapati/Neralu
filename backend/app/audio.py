"""Pre-recorded call prompts, one folder per language, with fallback to a language we have."""
import re
from pathlib import Path

AUDIO_ROOT = Path(__file__).resolve().parent.parent / "static" / "audio"
# Spoken Urdu and Hindi are mutually intelligible; everything ends at English.
FALLBACKS = {"ur": ["hi"]}
DEFAULT_LANG = "en"
_NAME = re.compile(r"^[a-z0-9_]+$")


def candidates(lang: str) -> list[str]:
    order = [lang, *FALLBACKS.get(lang, []), DEFAULT_LANG]
    return list(dict.fromkeys(order))


def resolve(lang: str, name: str) -> Path | None:
    """The clip to play for `name` in `lang`, or None if no language has it."""
    if not _NAME.match(name) or not _NAME.match(lang):
        return None
    for code in candidates(lang):
        path = AUDIO_ROOT / code / f"{name}.mp3"
        if path.is_file():
            return path
    return None
