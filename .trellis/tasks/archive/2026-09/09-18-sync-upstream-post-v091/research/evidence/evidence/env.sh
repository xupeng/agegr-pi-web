#!/usr/bin/env bash
# Isolated release environment for @xup3ng/pi-web 0.9.4
# Task: .trellis/tasks/09-18-sync-upstream-post-v091 (阶段 B)
# Fresh private HOME/XDG/cache/TMPDIR/agent dir. No real credentials, sessions or settings.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ROOT

export HOME="$ROOT/home"
export XDG_CONFIG_HOME="$ROOT/xdg-config"
export XDG_DATA_HOME="$ROOT/xdg-data"
export XDG_CACHE_HOME="$ROOT/xdg-cache"
export XDG_STATE_HOME="$ROOT/xdg-state"
export PI_CODING_AGENT_DIR="$ROOT/agent"
export TMPDIR="$ROOT/tmp"

export NPM_CONFIG_USERCONFIG="$ROOT/npmrc"
export NPM_CONFIG_CACHE="$ROOT/npm-cache"
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NPM_CONFIG_PREFIX="$ROOT/install"
export npm_config_registry="https://registry.npmjs.org/"

# make sure nothing real leaks in from the caller's shell
unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS NPM_CONFIG__AUTH NPM_CONFIG_ALWAYS_AUTH 2>/dev/null || true
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy 2>/dev/null || true

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" \
         "$PI_CODING_AGENT_DIR" "$TMPDIR" "$ROOT/npm-cache" "$ROOT/logs" "$ROOT/check" \
         "$ROOT/artifacts" "$ROOT/install" "$ROOT/fixture" "$ROOT/evidence"

export PATH="$ROOT/install/bin:$PATH"
