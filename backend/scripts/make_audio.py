"""Generate call prompt MP3s: English with Kokoro, Hindi with Sarvam (Bulbul).

Setup once (separate venv; Kokoro pulls in PyTorch):
    uv venv --python 3.11 .venv-tts
    uv pip install --python .venv-tts/Scripts/python.exe "kokoro>=0.9.4" "transformers>=4.44" soundfile lameenc
    uv pip install --python .venv-tts/Scripts/python.exe "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
Run from backend/:
    .venv-tts/Scripts/python.exe scripts/make_audio.py en hi [--force] [--only greet,q_water]
Hindi needs SARVAM_API_KEY in backend/.env. Existing files are kept unless --force.
"""
import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prompts import EN, HI, en  # noqa: E402

BACKEND = Path(__file__).resolve().parent.parent
AUDIO = BACKEND / "static" / "audio"

KOKORO_VOICE = "af_heart"        # top-graded Kokoro voice
SARVAM_VOICE = "ritu_hi_customer_warm"
SARVAM_MODEL = "bulbul:v4-flash"
PACE = 0.9                       # a little slower than default for elderly listeners


def env_value(key: str) -> str:
    for line in (BACKEND / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].split("#")[0].strip()
    return ""


def to_mp3(samples, rate: int) -> bytes:
    import lameenc
    import numpy as np

    peak = float(np.max(np.abs(samples))) or 1.0
    pcm = (samples / peak * 0.89 * 32767).astype("<i2").tobytes()  # normalise to about -1 dBFS
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()


class Kokoro:
    def __init__(self):
        from kokoro import KPipeline
        self.pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    def __call__(self, text: str) -> bytes:
        import numpy as np
        chunks = [audio.numpy() for _, _, audio in self.pipe(en(text), voice=KOKORO_VOICE, speed=PACE)]
        silence = np.zeros(int(24000 * 0.15), dtype="float32")  # short lead-in so phones don't clip
        return to_mp3(np.concatenate([silence, *chunks, silence]), 24000)


class Sarvam:
    def __init__(self):
        self.key = env_value("SARVAM_API_KEY")
        if not self.key:
            sys.exit("SARVAM_API_KEY is empty in backend/.env")

    def __call__(self, text: str) -> bytes:
        body = json.dumps({"text": text, "language_code": "hi-IN", "speaker": SARVAM_VOICE,
                           "model": SARVAM_MODEL, "pace": PACE, "output_audio_codec": "mp3",
                           "speech_sample_rate": 24000}).encode()
        req = urllib.request.Request("https://api.sarvam.ai/text-to-speech", data=body, headers={
            "api-subscription-key": self.key, "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return base64.b64decode(json.load(r)["audios"][0])


LANGS = {"en": (EN, Kokoro), "hi": (HI, Sarvam)}


def main() -> None:
    args = sys.argv[1:]
    force = "--force" in args
    only = next((a.split("=", 1)[1].split(",") for a in args if a.startswith("--only=")), None)
    langs = [a for a in args if a in LANGS] or list(LANGS)
    for lang in langs:
        texts, engine_cls = LANGS[lang]
        out = AUDIO / lang
        out.mkdir(parents=True, exist_ok=True)
        todo = {k: v for k, v in texts.items()
                if (only is None or k in only) and (force or not (out / f"{k}.mp3").exists())}
        if not todo:
            print(f"{lang}: nothing to do (use --force to regenerate)")
            continue
        engine = engine_cls()
        for name, text in todo.items():
            (out / f"{name}.mp3").write_bytes(engine(text))
            print(f"{lang}: wrote {name}.mp3")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
