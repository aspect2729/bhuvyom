#!/bin/bash
# Double-click to (re)run the NASA NEX-GDDP-CMIP6 download only. Resumable. Needs ds.nccs.nasa.gov reachable (turn Cloudflare WARP off if it times out).
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend" && source .venv/bin/activate
echo "Testing connection to NASA NCCS…"
if ! curl -sS -m 30 -o /dev/null https://ds.nccs.nasa.gov/thredds/catalog/catalog.xml; then
  echo "✗ Can't reach ds.nccs.nasa.gov. Turn off Cloudflare WARP / VPN and double-click this again."; read -n1 -p "Press any key to close"; exit 1
fi
echo "✓ Connected. Downloading (15–40 min). You can leave this window open."
python -u scripts/acquire_cmip6.py 2>&1 | tee "$ROOT/logs/cmip6.log"
echo "Done — refresh http://127.0.0.1:5173/future"; read -n1 -p "Press any key to close"
