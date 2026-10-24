"""Pre-recorded call prompts, one folder per language, with fallback to a language we have."""
import importlib.util
import re
from functools import lru_cache
from pathlib import Path

AUDIO_ROOT = Path(__file__).resolve().parent.parent / "static" / "audio"
PROMPTS_FILE = Path(__file__).resolve().parent.parent / "scripts" / "prompts.py"
SPEECH_LANG = {"en": "en-IN", "hi": "hi-IN"}  # text-to-speech languages for a prompt with no clip yet
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


@lru_cache
def _texts() -> dict[str, dict[str, str]]:
    """The prompt texts the clips are generated from (scripts/prompts.py)."""
    try:
        spec = importlib.util.spec_from_file_location("neralu_prompts", PROMPTS_FILE)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except (FileNotFoundError, AttributeError):
        return {}
    return {"en": mod.EN, "hi": mod.HI, "kn": mod.KN}


def fallback_speech(lang: str, name: str) -> tuple[str, str] | None:
    """(text, BCP-47 language) to speak when no language has a clip for `name` yet. Hindi is spoken in
    Hindi; everything else in Indian English, since Kannada text-to-speech voices vary by phone."""
    texts = _texts()
    code = lang if lang in SPEECH_LANG and name in texts.get(lang, {}) else "en"
    text = texts.get(code, {}).get(name)
    return (text, SPEECH_LANG[code]) if text else None
