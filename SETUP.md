# Setting up Neralu on a new laptop

Everything a teammate needs to install and run Neralu, start to finish. Commands are for
**Windows (PowerShell)** unless marked. macOS/Linux equivalents follow each step.

---

## 1. Install these first (once per laptop)

| Tool | Version | Why | Get it |
|---|---|---|---|
| **Git** | any recent | clone and push the code | https://git-scm.com |
| **Python** | **3.11, 3.12 or 3.13** (3.11 is what we test on) | backend | https://www.python.org/downloads/ · tick "Add python.exe to PATH" |
| **Node.js** | **20 or newer** (we use 24) · comes with npm | website | https://nodejs.org (LTS) |
| **ngrok** | 3.x, kept up to date | lets Twilio reach your laptop for real calls | `winget install ngrok.ngrok` · or https://ngrok.com/download |
| uv *(optional)* | any | faster Python installs | `winget install astral-sh.uv` |

Check them:

```
git --version
python --version      # must say 3.11, 3.12 or 3.13
node --version        # v20 or newer
npm --version
```

Python 3.14 is not tested; if `python --version` shows 3.14, install 3.11 as well and use
`py -3.11` in place of `python` below.

---

## 2. Get the code

```
git clone https://github.com/Priyanshu-senapati/Neralu.git
cd Neralu
```

---

## 3. Backend (Python)

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -e . --no-deps
copy .env.example .env
```

macOS/Linux: `python3 -m venv .venv`, `source .venv/bin/activate`, `cp .env.example .env`.

`requirements.txt` pins the exact versions known to work. The libraries it installs:

| Library | What it does in Neralu |
|---|---|
| fastapi, uvicorn | web server and API |
| sqlmodel (SQLAlchemy + SQLite) | database: residents, calls, cases, events |
| pydantic-settings | reads settings from `backend/.env` |
| sse-starlette | live updates to the dashboard (server-sent events) |
| twilio | real phone calls and SMS |
| httpx | calls Sarvam (speech) and downloads call recordings |
| python-multipart | reads Twilio's form posts and browser-phone audio |
| pytest, pytest-asyncio | tests |

Check it worked (should end with `passed`):

```
pytest -q
```

---

## 4. Website (Node)

```
cd ..\frontend
npm ci
```

`npm ci` installs exactly what `package-lock.json` lists. Main libraries: React 19, React Router,
Vite, Tailwind CSS 4, TypeScript, Leaflet + react-leaflet (street map), three.js (3D ward), d3,
GSAP and motion (animation), lucide-react (icons).

Check it worked:

```
npm run build
```

---

## 5. Settings: `backend/.env`

`.env` holds secrets. It is in `.gitignore`: **never commit it** and never paste keys in chat.
Without any keys, everything except real calls works (the dashboard, simulated residents,
volunteer and registration pages, and the browser phone).

| Setting | What to put | Where to get it |
|---|---|---|
| `TELEPHONY_MODE` | `twilio` for real calls, `browser` to ring the `/phone` page instead | — |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | your Twilio credentials | Twilio console → Account Info |
| `TWILIO_FROM_NUMBER` | the Twilio number, e.g. `+1...` | Twilio console → Phone Numbers |
| `KAMALA_PHONE` | the demo phone, e.g. `+91...` (must be verified on a trial account) | Twilio → Verified Caller IDs |
| `PUBLIC_BASE_URL` | your ngrok address, e.g. `https://xyz.ngrok-free.dev` (no trailing slash) | ngrok dashboard → Domains |
| `SARVAM_API_KEY` | speech-to-text for the spoken day | https://dashboard.sarvam.ai → API Keys |
| `ORIENTATION_MODE` | `keypad` on a Twilio **trial** (trials cannot record), `voice` when upgraded | — |
| `LANGUAGE_MENU` | `true` = calls start with "1 Kannada, 2 Hindi, 3 English" | — |

Twilio trial accounts also need **India** ticked under Voice → Settings → Geo permissions.

---

## 6. Run it

### On stage · one command, everything (recommended for the demo)

```
powershell -ExecutionPolicy Bypass -File scripts\stage.ps1            # real calls: server + ngrok
powershell -ExecutionPolicy Bypass -File scripts\stage.ps1 -Browser   # no telecom: calls ring /phone
powershell -ExecutionPolicy Bypass -File scripts\stage.ps1 -Pilot     # pilot mode: a real day, rounds start by themselves
powershell -ExecutionPolicy Bypass -File scripts\stage-stop.ps1       # stop everything
```

It builds the website, starts the server and ngrok in their own windows (they keep running if the
terminal closes), waits until both answer, prints a **go / no-go** check and every link. Priya's
link goes through ngrok, so it works on any network. Add `-SkipBuild` for a faster restart.
The ward console shows the same checks live in a strip under the top bar ("Ready for live calls").

### Option A · one command (demo laptop, uses less memory)

From the repo root:

```
powershell -ExecutionPolicy Bypass -File scripts\demo.ps1
```

macOS/Linux: `scripts/demo.sh`. It builds the website and serves everything on
**http://localhost:8000**, and prints the address for phones on the same Wi-Fi.

### Option B · two servers (development, live reload of the website)

Terminal 1:

```
cd backend
.venv\Scripts\activate
python -m uvicorn app.main:app --port 8000 --host 0.0.0.0 --timeout-graceful-shutdown 2
```

Terminal 2:

```
cd frontend
npm run dev -- --port 5180 --host
```

Open http://localhost:5180. On Windows do **not** add `--reload` to uvicorn: it can leave an
old copy holding port 8000.

### Pages

| Page | Address (Option B; use :8000 for Option A) |
|---|---|
| Story / landing | http://localhost:5180/ |
| Ward console | http://localhost:5180/ward (passcode: `OFFICER_PASSCODE` in `backend/.env`) |
| Volunteer (Priya) | console > Demo controls > Priya's volunteer phone (`/volunteer#` + `VOLUNTEER_DEMO_TOKEN`) |
| Family registration | http://localhost:5180/register |
| Browser phone | http://localhost:5180/phone |

### For real phone calls, also start ngrok (its own window, keep it open)

```
ngrok config add-authtoken YOUR_NGROK_TOKEN      # once per laptop
ngrok http --url=YOUR-DOMAIN.ngrok-free.dev 8000
```

Check https://YOUR-DOMAIN.ngrok-free.dev/health shows `{"ok":true}` before calling. Then on the
ward console: Demo controls → Heatwave → Start round 1.

---

## 7. Optional: regenerate the call voices

Not needed to run Neralu; the audio files are in the repo (`backend/static/audio/<lang>/`).
Only if you edit the prompt texts in `backend/scripts/prompts.py`:

```
cd backend
.venv\Scripts\python scripts\make_audio.py en hi kn --force
```

This uses Sarvam (needs `SARVAM_API_KEY`). The `--kokoro` English voice needs a separate,
large install (PyTorch); see the top of `backend/scripts/make_audio.py`.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `python` not found, or wrong version | reinstall Python with "Add to PATH", or use `py -3.11` |
| `pip install` fails building a package | you are on Python 3.14; use 3.11 |
| Website error "Failed to resolve import …" | run `npm ci` again in `frontend`, then restart `npm run dev` |
| "Port 8000 / 5180 already in use" | an old server is still running: close it, or in PowerShell `Get-NetTCPConnection -LocalPort 8000 \| % { Stop-Process -Id $_.OwningProcess -Force }` |
| Call rings, then "application error" / "can't reach server" | ngrok is not running, or `PUBLIC_BASE_URL` does not match the ngrok address exactly |
| Call fails immediately | Twilio trial: number not verified, or India not enabled in Geo permissions |
| Servers stop by themselves | the laptop is low on memory: close other apps and browser tabs, use `scripts\stage.ps1` |
| Status strip is red | it names the fix (e.g. "start ngrok"); press Recheck after fixing |
| Phone shows "You are about to visit … ngrok" | normal on ngrok's free plan: tap **Visit Site** once |
| Dashboard says "Reconnecting" | the backend stopped; restart it, the page recovers on its own |
| Phone cannot open the volunteer page | the phone must be on the same Wi-Fi, and the laptop's address changes per network |
| Tests fail after editing `.env` | they should not (tests pin their own settings); run `pytest -q` from `backend/` |
