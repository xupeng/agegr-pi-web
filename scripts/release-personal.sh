#!/usr/bin/env bash
#
# 打包并发布 pi-web personal 版本到 GitHub Releases（xupeng/agegr-pi-web）。
#
# 流程：bump version → next build → npm pack → push 分支 → tag+push → gh release create
#
# 用法：
#   ./scripts/release-personal.sh                # 自动递增 patch（0.8.9-personal.N → N+1）
#   ./scripts/release-personal.sh 0.8.9-personal.4   # 指定版本
#
# 前置要求：
#   - 当前在 personal 分支且工作区干净
#   - gh CLI 已安装并认证（gh auth login）
#
set -euo pipefail

REPO="xupeng/agegr-pi-web"
BRANCH="personal"

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "错误：工作区不干净，请先提交所有改动。" >&2
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  echo "错误：需要 gh CLI（brew install gh）" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "错误：gh 未认证（gh auth login）" >&2
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
  if [[ "$CURRENT" =~ ^0\.8\.9-personal\.([0-9]+)$ ]]; then
    NEW="0.8.9-personal.$(( ${BASH_REMATCH[1]} + 1 ))"
  else
    echo "错误：无法从当前版本自动递增（$CURRENT），请显式传版本号" >&2
    exit 1
  fi
fi
if [[ ! "$NEW" =~ ^0\.8\.9-personal\.[0-9]+$ ]]; then
  echo "错误：版本号格式应为 0.8.9-personal.N，收到：$NEW" >&2
  exit 1
fi

N="${NEW##*.}"
TAG="personal-0.8.9.${N}"
TARBALL="xupeng-pi-web-${NEW}.tgz"
RELEASE_URL="https://github.com/${REPO}/releases/download/${TAG}/${TARBALL}"

# 上一个 personal tag（用于生成"相对上一版新增"）
PREV_TAG="$(git tag -l 'personal-0.8.9.*' | sort -V | tail -1 || true)"

echo "==> 发布 $CURRENT -> $NEW"
echo "    tag:     $TAG"
echo "    tarball: $TARBALL"

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
# 2. next build（TURBOPACK 环境变量与 --webpack 冲突时移除）
# ---------------------------------------------------------------------------
echo "==> next build"
env -u TURBOPACK npm run build

# ---------------------------------------------------------------------------
# 3. npm pack
# ---------------------------------------------------------------------------
echo "==> npm pack"
npm pack >/dev/null
[[ -f "$TARBALL" ]] || { echo "错误：pack 未生成 $TARBALL" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 4. commit + push 分支
# ---------------------------------------------------------------------------
git add package.json
git commit -m "chore: bump version to $NEW"
echo "==> push $BRANCH"
git push origin "$BRANCH"

# ---------------------------------------------------------------------------
# 5. tag + push
# ---------------------------------------------------------------------------
echo "==> tag $TAG"
git tag "$TAG"
git push origin "$TAG"

# ---------------------------------------------------------------------------
# 6. gh release create（notes 含安装 oneliner）
# ---------------------------------------------------------------------------
NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT

{
  echo "预构建 tarball（next build 产物），其他机器安装后通过 \`next start\` 运行。"
  echo
  echo "相对上一版新增："
  if [[ -n "$PREV_TAG" ]]; then
    git log --oneline --no-merges "${PREV_TAG}..HEAD" | sed 's/^/- /' || true
  else
    git log --oneline --no-merges -5 | sed 's/^/- /' || true
  fi
  echo
  echo "安装（npm / pnpm 任选其一，可分别一键复制）："
  echo '**npm：**'
  echo '```bash'
  echo "npm install -g ${RELEASE_URL}"
  echo '```'
  echo '**pnpm：**'
  echo '```bash'
  echo "pnpm add -g ${RELEASE_URL}"
  echo '```'
} > "$NOTES"

echo "==> gh release create $TAG"
gh release create "$TAG" --repo "$REPO" --title "pi-web $NEW" --notes-file "$NOTES" "$TARBALL"

echo
echo "✅ 发布完成：$RELEASE_URL"
echo "   安装：npm install -g ${RELEASE_URL}"
