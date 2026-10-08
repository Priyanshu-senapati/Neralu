Kannada prompts go here, one MP3 per prompt, with the same file names as `../en/`.

Until a file exists here, Kannada callers hear the English clip of the same name (see
`app/audio.py`). Per plan §7.3 a native Kannada speaker writes and records these lines
(mono, normalised, each under about 6 s; `q_day_keypad.mp3` may run longer). Do not
machine-translate them. Sarvam has Kannada voices (`chaitra_kn_conversation`) if a
generated stopgap is needed from native-written text: add a `KN` table to
`scripts/prompts.py` and an entry in `scripts/make_audio.py`.
