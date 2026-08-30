#!/usr/bin/env bash
#
# 发布 @xup3ng/pi-web 到 npmjs（fork 独立版本线，稳定 semver）。
#
# 用法：
#   ./scripts/release-npm.sh                 # 自动递增 patch（0.9.0 → 0.9.1）
#   ./scripts/release-npm.sh 0.10.0          # 指定版本
#
# 流程：前置检查 → bump 版本 → build → dry-run → 确认 → publish（浏览器 web auth）→ 验证 → 提交 bump
#
# 前置要求：
#   - 工作区干净（发布起点），已提交本轮全部改动
#   - npm 已以 xup3ng 登录（2FA 已开启）
#   - 在自带终端执行：2FA 下 npm publish 需要浏览器打开 auth 链接授权，
#     自动化/代理环境无法代跑（日志中 URL 会被 npm 脱敏为 ***）
#
set -euo pipefail

PACKAGE="@xup3ng/pi-web"
EXPECTED_USER="xup3ng"

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# 前置检查
# ---------------------------------------------------------------------------
if [[ -n "$(git status --porcelain)" ]]; then
  echo "错误：工作区不干净，请先提交所有改动（发布必须从干净起点开始）。" >&2
  exit 1
fi

WHOAMI="$(npm whoami 2>/dev/null || true)"
if [[ "$WHOAMI" != "$EXPECTED_USER" ]]; then
  echo "错误：npm 当前登录为 '${WHOAMI:-<未登录>}'，需要以 $EXPECTED_USER 登录。" >&2
  echo "请先执行 npm login（浏览器授权 + 2FA）。" >&2
  exit 1
fi

CURRENT="$(node -p "require('./package.json').version")"
echo "当前版本: $CURRENT"
if [[ $# -ge 1 ]]; then
  echo "目标版本: $1"
else
  echo "目标版本: patch 递增（由 npm version 计算）"
fi

# ---------------------------------------------------------------------------
# bump 版本（写 package.json + package-lock.json，不打 tag）
# ---------------------------------------------------------------------------
if [[ $# -ge 1 ]]; then
  npm version "$1" --no-git-tag-version
else
  npm version patch --no-git-tag-version
fi
NEW_VERSION="$(node -p "require('./package.json').version")"
echo "✅ 版本已 bump 到 $NEW_VERSION"

# ---------------------------------------------------------------------------
# 构建（发布专用；TURBOPACK= 前缀防止环境变量 TURBOPACK=1 与 --webpack 冲突）
# ---------------------------------------------------------------------------
echo "→ 构建中（next build --webpack）..."
TURBOPACK= npm run build

# ---------------------------------------------------------------------------
# dry-run 验证产物
# ---------------------------------------------------------------------------
echo "→ 打包清单检查..."
DRYRUN="$(npm publish --dry-run 2>&1 || true)"
for needle in "LICENSE" "README.md" "bin/pi-web.js" "next.config.ts"; do
  if ! echo "$DRYRUN" | grep -qE "^npm notice .*$needle"; then
    echo "错误：dry-run 产物缺少 $needle，中止。" >&2
    echo "$DRYRUN" | tail -30 >&2
    exit 1
  fi
done
echo "✅ dry-run 产物完整（LICENSE / README / bin / next.config.ts）"

# ---------------------------------------------------------------------------
# 真实发布（2FA 需要浏览器授权）
# ---------------------------------------------------------------------------
echo ""
echo "即将真实发布 $PACKAGE@$NEW_VERSION 到 registry.npmjs.org"
echo "2FA 下 npm 会打印 https://www.npmjs.com/auth/cli/... 链接——"
echo "请在浏览器打开并完成授权，npm 会自动继续上传。"
read -r -p "按回车继续，Ctrl+C 取消..."

npm publish --access public

# ---------------------------------------------------------------------------
# 验证（npm 新包聚合文档传播有延迟，轮询等待）
# ---------------------------------------------------------------------------
echo "→ 验证发布结果（等待 registry 传播）..."
PUBLISHED=""
for _ in $(seq 1 18); do
  PUBLISHED="$(npm view "$PACKAGE" version 2>/dev/null || true)"
  if [[ "$PUBLISHED" == "$NEW_VERSION" ]]; then
    break
  fi
  sleep 10
done
if [[ "$PUBLISHED" == "$NEW_VERSION" ]]; then
  echo "✅ $PACKAGE@$NEW_VERSION 已发布并可见"
else
  echo "⚠️ 暂未在 registry 确认到 $NEW_VERSION（传播延迟或发布失败）。" >&2
  echo "   手动检查：npm view $PACKAGE，或 npm view $PACKAGE@$NEW_VERSION" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 提交版本 bump
# ---------------------------------------------------------------------------
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"
echo "✅ 已提交版本 bump（$(git rev-parse --short HEAD)）"
echo ""
echo "完成：$PACKAGE@$NEW_VERSION"
