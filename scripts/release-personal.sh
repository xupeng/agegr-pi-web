#!/usr/bin/env bash
#
# 为 pi-web personal 版本打 tag 并触发 GitHub Actions 自动发布（xupeng/agegr-pi-web）。
#
# 流程：bump version → commit → push 分支 → tag → push tag
# 之后 push 的 personal-* tag 会在 CI（.github/workflows/release-personal.yml）
# 中自动 next build → npm pack → gh release create。
#
# 用法：
#   ./scripts/release-personal.sh                # 自动递增 patch（0.8.x-personal.N → N+1）
#   ./scripts/release-personal.sh 0.8.11-personal.6   # 指定版本
#
# 前置要求：
#   - 当前在 personal 分支且工作区干净
#   - 可选：PI_WEB_RELEASE_PROXY 环境变量指定代理（默认 http://192.168.11.12:6789）
#
set -euo pipefail

BRANCH="personal"
PROXY="${PI_WEB_RELEASE_PROXY:-http://192.168.11.12:6789}"

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "错误：工作区不干净，请先提交所有改动。" >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "错误：必须在 $BRANCH 分支发布（当前：$(git branch --show-current)）" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 版本号
# ---------------------------------------------------------------------------
CURRENT="$(node -p "require('./package.json').version")"
if [[ $# -ge 1 ]]; then
  NEW="$1"
else
  if [[ "$CURRENT" =~ ^0\.8\.([0-9]+)-personal\.([0-9]+)$ ]]; then
    NEW="0.8.${BASH_REMATCH[1]}-personal.$(( ${BASH_REMATCH[2]} + 1 ))"
  else
    echo "错误：无法从当前版本自动递增（$CURRENT），请显式传版本号" >&2
    exit 1
  fi
fi
if [[ ! "$NEW" =~ ^0\.8\.[0-9]+-personal\.[0-9]+$ ]]; then
  echo "错误：版本号格式应为 0.8.x-personal.N，收到：$NEW" >&2
  exit 1
fi

N="${NEW##*.}"
MINOR="$(echo "$NEW" | sed -E 's/^0\.8\.([0-9]+)-personal\..*$/\1/')"
TAG="personal-0.8.${MINOR}.${N}"

echo "==> 发布 $CURRENT -> $NEW"
echo "    tag:     $TAG"
echo "    CI 将自动构建并发布到 GitHub Releases"

# ---------------------------------------------------------------------------
# 1. bump version（本地）
# ---------------------------------------------------------------------------
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = '$NEW';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"

# ---------------------------------------------------------------------------
# 2. commit + push 分支
# ---------------------------------------------------------------------------
git add package.json
git commit -m "chore: bump version to $NEW"
echo "==> push $BRANCH"
git -c http.proxy="$PROXY" -c https.proxy="$PROXY" push origin "$BRANCH"

# ---------------------------------------------------------------------------
# 3. tag + push（触发 CI 自动发布）
# ---------------------------------------------------------------------------
echo "==> tag $TAG"
git tag "$TAG"
git -c http.proxy="$PROXY" -c https.proxy="$PROXY" push origin "$TAG"

echo
echo "✅ tag 已推送，等待 CI 构建发布。"
echo "   发布结果：https://github.com/xupeng/agegr-pi-web/actions"
