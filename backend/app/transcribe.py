"""Speech-to-text for the orientation answer. Returns None on any error or timeout.

The transcript is only parsed for a weekday; it never decides an outcome (rules.py does).
"""
import asyncio
import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)

SARVAM_URL = "https://api.sarvam.ai/speech-to-text"
SARVAM_MODEL = "saaras:v4"
SARVAM_LANGS = {"kn": "kn-IN", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "ur": "ur-IN", "en": "en-IN"}


async def _sarvam(audio: bytes, lang: str, filename: str, mime: str) -> str | None:
    s = get_settings()
    if not s.sarvam_api_key:
        log.warning("SARVAM_API_KEY not set; orientation will score as uncertain")
        return None
    async with httpx.AsyncClient() as client:
        r = await client.post(
            SARVAM_URL,
            headers={"api-subscription-key": s.sarvam_api_key},
            data={"model": SARVAM_MODEL, "language_code": SARVAM_LANGS.get(lang, "unknown")},
            files={"file": (filename, audio, mime)},
        )
        r.raise_for_status()
        return r.json().get("transcript") or None


PROVIDERS = {"sarvam": _sarvam}


async def transcribe(audio: bytes, lang: str, filename: str = "answer.wav",
                     mime: str = "audio/wav") -> str | None:
    s = get_settings()
    provider = PROVIDERS.get(s.stt_provider)
    if provider is None:
        log.error("STT provider %r is not implemented", s.stt_provider)
        return None
    try:
        return await asyncio.wait_for(provider(audio, lang, filename, mime), timeout=s.stt_timeout_s)
    except Exception as exc:  # timeout, HTTP error, bad JSON: all mean "no transcript"
        log.warning("Transcription failed: %r", exc)
        return None


async def fetch_recording(recording_url: str) -> bytes | None:
    """Download a Twilio recording as WAV (needs account basic auth).

    Twilio often returns 404 for a few seconds after <Record> finishes, so keep trying for ~8 s.
    The caller is still hearing the help question meanwhile, so this rarely delays classification.
    """
    s = get_settings()
    async with httpx.AsyncClient(auth=(s.twilio_account_sid, s.twilio_auth_token),
                                 timeout=5) as client:
        for _ in range(16):
            try:
                r = await client.get(f"{recording_url}.wav")
                if r.status_code == 200:
                    return r.content
            except httpx.HTTPError as exc:
                log.warning("Recording fetch failed: %r", exc)
            await asyncio.sleep(0.5)
    return None
