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
SARVAM_LANGS = {"kn": "kn-IN", "hi": "hi-IN", "ta": "ta-IN", "te": "te-IN", "ur": "unknown"}


async def _sarvam(audio: bytes, lang: str) -> str | None:
    s = get_settings()
    if not s.sarvam_api_key:
        log.warning("SARVAM_API_KEY not set; orientation will score as uncertain")
        return None
    async with httpx.AsyncClient() as client:
        r = await client.post(
            SARVAM_URL,
            headers={"api-subscription-key": s.sarvam_api_key},
            data={"model": SARVAM_MODEL, "language_code": SARVAM_LANGS.get(lang, "unknown")},
            files={"file": ("answer.wav", audio, "audio/wav")},
        )
        r.raise_for_status()
        return r.json().get("transcript") or None


PROVIDERS = {"sarvam": _sarvam}


async def transcribe(audio: bytes, lang: str) -> str | None:
    s = get_settings()
    provider = PROVIDERS.get(s.stt_provider)
    if provider is None:
        log.error("STT provider %r is not implemented", s.stt_provider)
        return None
    try:
        return await asyncio.wait_for(provider(audio, lang), timeout=s.stt_timeout_s)
    except Exception as exc:  # timeout, HTTP error, bad JSON: all mean "no transcript"
        log.warning("Transcription failed: %r", exc)
        return None


async def fetch_recording(recording_url: str) -> bytes | None:
    """Download a Twilio recording as WAV (needs account basic auth; may lag a moment)."""
    s = get_settings()
    async with httpx.AsyncClient(auth=(s.twilio_account_sid, s.twilio_auth_token)) as client:
        for _ in range(3):
            r = await client.get(f"{recording_url}.wav")
            if r.status_code == 200:
                return r.content
            await asyncio.sleep(0.5)
    return None
