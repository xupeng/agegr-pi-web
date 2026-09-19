#!/usr/bin/env bash
# B9: publish the frozen, audited tarball as @xup3ng/pi-web@0.9.4 (irreversible).
# Run this in YOUR terminal so npm can prompt for the 2FA one-time password.
# It uses your normal ~/.npmrc login (no isolated env), and publishes the exact
# tarball that was audited in B5 -- it does not rebuild or repack anything.
set -euo pipefail

TGZ="/home/xupeng/dev/personal/forked/.pi-web-v094-release-20260918-182408/artifacts/xup3ng-pi-web-0.9.4.tgz"
EXPECTED_SHA256="eb6bb81cea02bf278caa727f55f51015e65bafe784b3e8a950b1ce0ed4a551f1"

echo "== 冻结产物校验 =="
sha256sum "$TGZ"
ACTUAL_SHA256="$(sha256sum "$TGZ" | cut -d' ' -f1)"
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
  echo "!! SHA256 与已审计值不一致，已中止（不要发布）"
  exit 1
fi
echo "OK: SHA256 与审计值一致"

echo "== 已登录账号 =="
npm whoami --registry=https://registry.npmjs.org/

echo "== 开始发布（npm 会要求 2FA 一次性密码）=="
exec npm publish "$TGZ" \
  --registry=https://registry.npmjs.org/ \
  --tag=latest \
  --access=public
