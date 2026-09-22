#!/usr/bin/env bash
# Establish a trustworthy lint/tsc/test baseline from a lockfile-consistent dependency tree.
#
# Usage: clean-tree-verify.sh <git-ref> <label>
#   <git-ref>  any commit-ish (branch, tag, SHA) to verify
#   <label>    short name used for the worktree directory and the log file
#
# Why: this checkout reuses one node_modules across tasks, so `npm run lint` can report
# diagnostics that a `package-lock.json`-consistent tree does not reproduce. The worktree
# is created as a sibling directory (never under /tmp, which is a 2 GiB tmpfs here).
set -uo pipefail

MAIN_REPO=/home/xupeng/dev/personal/forked/agegr-pi-web
WORKTREE_ROOT=/home/xupeng/dev/personal/forked
RESEARCH_DIR="$MAIN_REPO/.trellis/tasks/09-22-lint-baseline-drift/research"

REF="${1:?usage: clean-tree-verify.sh <git-ref> <label>}"
LABEL="${2:?usage: clean-tree-verify.sh <git-ref> <label>}"

WT="$WORKTREE_ROOT/pi-web-lintclean-$LABEL"
LOG="$RESEARCH_DIR/clean-tree-$LABEL.log"

mkdir -p "$RESEARCH_DIR"
rm -rf "$WT"

{
  echo "=== clean-tree baseline: ref=$REF label=$LABEL ==="
  echo "date: $(date -Is)"
  echo
} > "$LOG"

git -C "$MAIN_REPO" worktree add --detach "$WT" "$REF" >> "$LOG" 2>&1 || exit 1
echo "resolved commit: $(git -C "$WT" rev-parse HEAD)" >> "$LOG"

cd "$WT" || exit 1

run_step() {
  local name="$1"; shift
  echo >> "$LOG"
  echo "=== $name ===" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  local code=$?
  echo "${name}_exit=$code" >> "$LOG"
  return 0
}

run_step "npm_ci" npm ci
run_step "tsc" npx tsc --noEmit
run_step "lint" npm run lint
run_step "lint_summary_only" node -e '
process.exit(0)
'
run_step "test" npm test

echo >> "$LOG"
echo "=== tree state after verification ===" >> "$LOG"
git -C "$WT" status --porcelain >> "$LOG" 2>&1
node -e '
const p = require(process.argv[1] + "/package.json");
const l = require(process.argv[1] + "/package-lock.json").packages;
const fs = require("fs");
for (const name of ["react", "react-dom", "eslint", "next", "eslint-config-next"]) {
  const locked = l["node_modules/" + name]?.version ?? "ABSENT";
  let installed = "ABSENT";
  try { installed = JSON.parse(fs.readFileSync(process.argv[1] + "/node_modules/" + name + "/package.json", "utf8")).version; } catch {}
  const mark = locked === installed ? "ok" : "DRIFT";
  console.log(`${mark}\t${name}\tlock=${locked}\tinstalled=${installed}`);
}
' "$WT" >> "$LOG" 2>&1

echo >> "$LOG"
echo "worktree kept for inspection: $WT" >> "$LOG"
echo "DONE" >> "$LOG"
