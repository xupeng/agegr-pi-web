#!/usr/bin/env bash
# B6 production-install smoke for the installed @xup3ng/pi-web 0.9.4 tarball.
# Usage: bash smoke.sh <port>
#
# Order matters: routes that take ?cwd= only accept roots registered through
# POST /api/cwd/validate, so the fixture is validated before those probes.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:?port required}"
BASE="http://127.0.0.1:$PORT"
OUT="$ROOT/evidence/b6-smoke.txt"
FIXTURE="$ROOT/fixture/demo"
TERM_ID="$(python3 -c 'import secrets;print(secrets.token_hex(16))')"

: > "$OUT"
probe() { # probe <label> <url> [extra curl args...]
  local label="$1" url="$2"; shift 2
  local code size
  read -r code size < <(curl -s -o /dev/null -w '%{http_code} %{size_download}' --max-time 30 "$@" "$url")
  printf '%-44s %s  (%s bytes)\n' "$label" "$code" "$size" | tee -a "$OUT"
}
body() { # body <label> <url> [extra curl args...]
  local label="$1" url="$2"; shift 2
  printf '%-44s %s\n' "$label" "$(curl -s --max-time 30 "$@" "$url" | head -c 200)" | tee -a "$OUT"
}

echo "== B6 smoke: installed @xup3ng/pi-web 0.9.4 on port $PORT ==" | tee -a "$OUT"
echo "-- version: $(node -p "require('$ROOT/install/lib/node_modules/@xup3ng/pi-web/package.json').version")" | tee -a "$OUT"

echo "== page + static assets (asset URLs taken from the rendered HTML) ==" | tee -a "$OUT"
probe "GET /"                     "$BASE/"
probe "GET /login"                "$BASE/login"
probe "GET /manifest.webmanifest" "$BASE/manifest.webmanifest"
curl -s --max-time 30 "$BASE/" > "$ROOT/evidence/b6-index.html"
mapfile -t ASSETS < <(grep -oE '/_next/static/(css|chunks)/[^"'"'"'\\ ]+' "$ROOT/evidence/b6-index.html" | sort -u | head -4)
for a in "${ASSETS[@]}"; do probe "GET ${a:0:56}" "$BASE$a"; done

echo "== cwd-independent API ==" | tee -a "$OUT"
probe "GET /api/home"            "$BASE/api/home"
probe "GET /api/projects"        "$BASE/api/projects"
probe "GET /api/agent/running"   "$BASE/api/agent/running"
probe "GET /api/tools/settings"  "$BASE/api/tools/settings"
probe "GET /api/subagents/settings" "$BASE/api/subagents/settings"
probe "GET /api/default-cwd"     "$BASE/api/default-cwd"

echo "== fixture project: validate first (registers the allowed root) ==" | tee -a "$OUT"
body "POST /api/cwd/validate" "$BASE/api/cwd/validate" \
  -X POST -H 'content-type: application/json' -d "{\"cwd\":\"$FIXTURE\"}"

echo "== fixture project API (cwd-dependent) ==" | tee -a "$OUT"
probe "GET /api/models?cwd=fixture"          "$BASE/api/models?cwd=$FIXTURE"
probe "GET /api/skills?cwd=fixture"          "$BASE/api/skills?cwd=$FIXTURE"
probe "GET /api/plugins?cwd=fixture"         "$BASE/api/plugins?cwd=$FIXTURE"
probe "GET /api/files/.../README.md?type=read" "$BASE/api/files${FIXTURE}/README.md?type=read"
probe "GET /api/files/...?type=list"         "$BASE/api/files${FIXTURE}?type=list"
body  "GET /api/worktrees?cwd=fixture"       "$BASE/api/worktrees?cwd=$FIXTURE"
body  "GET /api/sessions?projectKey=fixture" "$BASE/api/sessions?projectKey=$FIXTURE"

echo "== terminal smoke (node-pty create + delete, id=$TERM_ID) ==" | tee -a "$OUT"
body "POST /api/terminal" "$BASE/api/terminal" \
  -X POST -H 'content-type: application/json' \
  -d "{\"id\":\"$TERM_ID\",\"cwd\":\"$FIXTURE\",\"cols\":80,\"rows\":24}"
probe "GET /api/terminal/<id>" "$BASE/api/terminal/$TERM_ID"
printf '%-44s %s\n' "DELETE /api/terminal/<id>" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X DELETE "$BASE/api/terminal/$TERM_ID")" | tee -a "$OUT"

echo "== cleanup ==" | tee -a "$OUT"
PIDS="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u | tr '\n' ' ')"
echo "listener pids: ${PIDS:-none}" | tee -a "$OUT"
for pid in $PIDS; do
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [ -n "$pgid" ] && kill -TERM -"$pgid" 2>/dev/null
done
for i in $(seq 1 20); do
  sleep 1
  if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "port released after ${i}s" | tee -a "$OUT"
    break
  fi
done
echo "listeners left: $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | wc -l)" | tee -a "$OUT"
echo "installed-server processes left: $(pgrep -fc 'pi-web-v094-release.*install/bin/pi-web' 2>/dev/null || echo 0)" | tee -a "$OUT"
