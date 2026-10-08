"""Generate TEMPORARY English prompt audio with Windows speech synthesis.

Replace every file with the native-speaker Kannada recordings before the demo (plan §7.3).
Run on Windows:  uv run --with lameenc python scripts/make_temp_audio.py
Existing files are kept unless --force is passed, so real recordings are never overwritten.
"""
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import lameenc

OUT = Path(__file__).resolve().parent.parent / "static" / "audio" / "kn"

LINES = {
    "greet": "Namaskara. This is Neralu, the heat care service from your ward office.",
    "name_kamala": "Kamala avare,",
    "code_intro": "Your family's code word is:",
    "safety": "Neralu will never ask for money, OTP, Aadhaar or bank details.",
    "q_water": "Have you had water in the last hour? Press 1 for yes, 2 for no.",
    "q_symptoms": "Do you feel dizzy, weak or confused? Press 1 for yes, 2 for no.",
    "q_room": "Is your room very hot right now? Press 1 for yes, 2 for no.",
    "q_fan": "Is your fan or cooler working? Press 1 for yes, 2 for no.",
    "q_orientation": "Please tell me, what day is it today?",
    "q_day_keypad": "Which day is it today? Press 1 for Monday, 2 for Tuesday, 3 for Wednesday, "
                    "4 for Thursday, 5 for Friday, 6 for Saturday, 7 for Sunday.",
    "q_help": "If you need help now, press 2. If you are okay, press 1.",
    "reprompt": "Sorry, I didn't catch that.",
    "advice": "Please drink a glass of water now and stay in the coolest part of your home.",
    "close_ok": "Thank you. We will check on you again later today.",
    "close_help": "Thank you. Someone from your area is being informed now.",
}
CODE_WORDS = {"mallige": "Mallige", "sampige": "Sampige", "sevanthige": "Sevanthige",
              "tulasi": "Tulasi", "maavu": "Maavu", "bevu": "Bevu", "kaveri": "Kaveri",
              "chandra": "Chandra", "nakshatra": "Nakshatra", "gulabi": "Gulabi"}

PS = """Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -1
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($env:NERALU_WAV, $fmt)
$s.Speak($env:NERALU_TEXT)
$s.Dispose()
"""


def synth(text: str, dest: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "x.wav"
        env = {**__import__("os").environ, "NERALU_WAV": str(wav), "NERALU_TEXT": text}
        subprocess.run(["powershell", "-NoProfile", "-Command", PS], check=True, env=env)
        with wave.open(str(wav)) as w:
            pcm, rate = w.readframes(w.getnframes()), w.getframerate()
    enc = lameenc.Encoder()
    enc.set_bit_rate(48)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    dest.write_bytes(enc.encode(pcm) + enc.flush())


def main() -> None:
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = dict(LINES) | {f"code_{k}": v for k, v in CODE_WORDS.items()}
    for name, text in jobs.items():
        dest = OUT / f"{name}.mp3"
        if dest.exists() and not force:
            continue
        synth(text, dest)
        print("wrote", dest.name)


if __name__ == "__main__":
    main()
