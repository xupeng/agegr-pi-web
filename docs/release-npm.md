# npm 发布（fork 独立版本线）

本 fork 的独立 npm 包 **`@xup3ng/pi-web`** 发布说明（区别于 upstream 的
`@agegr/pi-web` 与 personal 内部版本的 git-tag + CI 流程，见
[`scripts/release-personal.sh`](../scripts/release-personal.sh)）。

## 快速开始

```bash
./scripts/release-npm.sh              # patch 递增（0.9.0 → 0.9.1）
./scripts/release-npm.sh 0.10.0       # 指定版本
```

脚本自动完成：前置检查 → bump 版本 → build → dry-run → **确认后 publish**
（浏览器 2FA 授权）→ 验证 → 提交版本 bump。

## 前置要求

- 工作区干净（发布从干净起点开始；本轮功能/README 改动先提交）。
- npm 已以 `xup3ng` 登录：`npm whoami` 应输出 `xup3ng`；未登录则先
  `npm login`（新版为浏览器授权流程）。
- 账号已开启 2FA（npm 2026-05 起发布强制要求）。TOTP 即可，个人手动发布
  无需创建 bypass-2FA token（2027-01 起该类 token 将失去直接发布能力，
  自动化场景官方建议 OIDC trusted publishing / staged publishing）。
- **在自带终端执行**：2FA 下 `npm publish` 会打印
  `https://www.npmjs.com/auth/cli/...` 链接，需浏览器打开完成授权后自动
  继续上传；该 URL 在日志中会被 npm 脱敏为 `***`，无法由他人代跑。

## 手动发布（不用脚本时）

```bash
# 1. bump（写 package.json + package-lock.json）
npm version patch --no-git-tag-version

# 2. 构建（发布专用；TURBOPACK= 前缀防止 TURBOPACK=1 与 --webpack 冲突）
TURBOPACK= npm run build

# 3. 产物检查（应包含 LICENSE/README/bin/.next/public）
npm publish --dry-run

# 4. 真实发布（浏览器 2FA 授权）
npm publish --access public

# 5. 验证（注意传播延迟）
npm view @xup3ng/pi-web
npm view @xup3ng/pi-web dist-tags   # latest 应指向新版本
```

## 常见问题

- **发布后 `npm view` / `npx` 短暂 404**：npm 新包/新版本有最终一致性延迟，
  tarball 与版本页（`/-/pi-web-<v>.tgz`、`/<v>`）立即可见，但聚合文档与
  `@latest` 解析可能延迟约 2-4 分钟。稍等重试即可。
- **`EOTP` / 需要浏览器授权**：账号开了 2FA，属预期。按提示在浏览器完成
  `npmjs.com/auth/cli/...` 授权后 npm 自动继续。
- **版本号不可覆盖**：npm 禁止重发同版本；发布成功后发现错误只能 bump 新
  版本（如 0.9.1），不能修改已发布的 0.9.0（unpublish 仅限 72h 窗口，慎用）。
- **build 污染 `.next/`**：发布构建会重写 `.next/`，发布后若 `npm run dev`
  异常，按 `AGENTS.md` 的 dev 故障流程（备份 `.next` → 重启）处理。

## 与 personal 内部版本的区分

| 渠道 | 版本 | 命令 | 发布目标 |
| --- | --- | --- | --- |
| npm（本脚本） | `0.9.x` 稳定 semver | `./scripts/release-npm.sh` | registry.npmjs.org 公开包 |
| personal 内部 | `0.8.11-personal.N` | `./scripts/release-personal.sh` | GitHub Release（tag + Actions） |
