#!/usr/bin/env sh
# One command, one port: builds the website and serves it with the API on :8000.
# Phones on the same Wi-Fi open the printed address. Usage: scripts/demo.sh  (from the repo root)
set -e
cd "$(dirname "$0")/.."

echo "Building the website..."
(cd frontend && npm install --silent && npm run build --silent)

if [ ! -x backend/.venv/bin/uvicorn ]; then
  echo "Setting up the backend (first run only)..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --quiet -e "backend[dev]"
fi

LAN=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "  Neralu is running"
echo "  On this laptop:   http://localhost:8000"
[ -n "$LAN" ] && echo "  On phones (Wi-Fi): http://$LAN:8000"
echo "  Stop with Ctrl+C"
echo ""
cd backend && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
