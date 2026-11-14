#!/bin/bash
# Double-click in Finder to start everything: BhuVyom API (:8001), website (:5173), and the NASA CMIP6 download.
# Logs go to ~/nasa/logs/. Close this Terminal window (or press Ctrl+C) to stop the website; run STOP_BHUVYOM.command to stop the rest.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$ROOT/logs"
cd "$ROOT/backend"
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
echo "▸ Installing backend packages…"
pip install -q -r requirements.txt
echo "▸ Starting BhuVyom API on http://127.0.0.1:8001 (log: logs/api.log)"
lsof -ti tcp:8001 | xargs kill 2>/dev/null || true
nohup uvicorn main:app --port 8001 > "$ROOT/logs/api.log" 2>&1 &
echo $! > "$ROOT/logs/api.pid"
if [ ! -s data/processed/nex_gddp_cmip6/annual.jsonl ] || [ "$(wc -l < data/processed/nex_gddp_cmip6/annual.jsonl)" -lt 6000 ]; then
  echo "▸ Downloading NASA NEX-GDDP-CMIP6 projections in the background (log: logs/cmip6.log, ~15–40 min, resumable)"
  nohup python -u scripts/acquire_cmip6.py > "$ROOT/logs/cmip6.log" 2>&1 &
  echo $! > "$ROOT/logs/cmip6.pid"
else
  echo "▸ CMIP6 projections already downloaded"
fi
deactivate
cd "$ROOT/web"
echo "▸ Installing website packages…"
npm install --no-audit --no-fund
lsof -ti tcp:5173 | xargs kill 2>/dev/null || true
(sleep 6 && open "http://127.0.0.1:5173") &
echo "▸ Website: http://127.0.0.1:5173   (Simulation Lab /lab · Future Earth /future · Explorer /explore)"
npm run dev
