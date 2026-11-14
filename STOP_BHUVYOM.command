#!/bin/bash
ROOT="$(cd "$(dirname "$0")" && pwd)"
for f in api cmip6; do [ -f "$ROOT/logs/$f.pid" ] && kill "$(cat "$ROOT/logs/$f.pid")" 2>/dev/null && echo "stopped $f"; done
lsof -ti tcp:8001 tcp:5173 | xargs kill 2>/dev/null || true
echo "BhuVyom stopped."
