#!/usr/bin/env sh
# One command, one port: installs what is missing, builds the website and serves it with the API on :8000.
# Safe to run every time: libraries are reinstalled only when requirements.txt or package-lock.json change,
# so a second run works offline. Phones on the same Wi-Fi open the printed address.
# Usage: scripts/demo.sh  (from anywhere)
set -e
cd "$(dirname "$0")/.."

fail() { echo "Error: $1" >&2; exit 1; }
newer() { [ ! -f "$2" ] || [ "$1" -nt "$2" ]; }  # $1 changed since $2 was written (or $2 is missing)

# --- Tools ---
command -v node >/dev/null || fail "Node.js is not installed. Get the 22 LTS from https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)' \
  || fail "Node $(node --version) is too old. The website needs 20.19+ or 22.12+ (get the 22 LTS from https://nodejs.org)"
node -e "require('net').connect(8000,'127.0.0.1').on('connect',()=>process.exit(1)).on('error',()=>process.exit(0))" \
  || fail "Port 8000 is already in use: Neralu is probably running in another window. Stop it there with Ctrl+C (or run: pkill -f 'uvicorn app.main'), then run this again."

# --- Backend: exact versions from backend/requirements.txt ---
VPY=backend/.venv/bin/python
if [ ! -x "$VPY" ]; then
  PY=""
  for c in python3.11 python3.12 python3.13 python3; do
    if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) else 1)'; then
      PY="$c"; break
    fi
  done
  [ -n "$PY" ] || fail "Python 3.11, 3.12 or 3.13 is needed (https://www.python.org/downloads/)"
  echo "Creating the backend environment with $PY (first run only)..."
  "$PY" -m venv backend/.venv
fi
STAMP=backend/.venv/.neralu-requirements
if newer backend/requirements.txt "$STAMP" || newer backend/pyproject.toml "$STAMP"; then
  echo "Installing backend libraries (exact versions)..."
  if "$VPY" -m pip --version >/dev/null 2>&1; then
    "$VPY" -m pip install --quiet -r backend/requirements.txt
    "$VPY" -m pip install --quiet -e backend --no-deps
  elif command -v uv >/dev/null; then  # a venv made by uv has no pip
    uv pip install --quiet --python "$VPY" -r backend/requirements.txt
    uv pip install --quiet --python "$VPY" -e backend --no-deps
  else
    fail "backend/.venv has no pip. Delete backend/.venv and run this again."
  fi
  touch "$STAMP"
fi
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Created backend/.env. For real calls fill in the Twilio settings (SETUP.md section 5);"
  echo "without Twilio, set TELEPHONY_MODE=browser to ring the /phone page instead."
fi

# --- Website: exact versions from frontend/package-lock.json ---
if newer frontend/package-lock.json frontend/node_modules/.package-lock.json; then
  echo "Installing website libraries (exact versions)..."
  (cd frontend && npm ci --no-audit --no-fund)
fi
echo "Building the website..."
(cd frontend && npm run build --silent)

LAN=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "  Neralu is running"
echo "  On this laptop:    http://localhost:8000"
[ -n "$LAN" ] && echo "  On phones (Wi-Fi): http://$LAN:8000"
echo "  Stop with Ctrl+C"
echo ""
cd backend && exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 2
