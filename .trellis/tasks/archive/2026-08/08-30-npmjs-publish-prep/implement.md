# 执行计划：@xup3ng/pi-web 0.9.0 独立发布

## 有序执行清单

1. **npm 账号准备**（前置，需用户操作，部分已完成）：
   - ✅ 已注册账号：用户名 `xup3ng`（2026-08-30 注册成功，曾遇 Cloudflare 临时拦截，换 IP 后成功）。
   - scope 归属：`@xup3ng/pi-web` 的 scope = 用户名 `xup3ng`，合法无需 org。`xupeng` 用户名被他人占用，不可用。
   - 待办：确认**邮箱已验证**（未验证邮箱发布会报 E403 EMAIL_NOT_VERIFIED）。
   - 待办：**开启 2FA**（发布强制要求，2026-05 起）：TOTP 或 WebAuthn/passkey。个人手动发布选 TOTP + `npm login` 即可；不必建 bypass-2FA token（2026-08 起不能用于账号操作，2027-01 将失去直接发布能力，官方建议自动化走 OIDC trusted publishing 或 staged publishing）。
   - 待办：`npm whoami` 确认已登录；未登录则 `npm login`（新版为浏览器授权流程，需交互，无法自动化时停下请用户完成）。
2. **包元数据修正**（`package.json`）：
   - `bugs.url` → `https://github.com/xupeng/agegr-pi-web/issues`
   - 补充 `author`（GitHub 身份 xupeng 或 npm 用户名 xup3ng，执行时二选一）、`keywords`（如 `pi`, `coding-agent`, `web-ui`, `chat`）
   - `name` → `@xup3ng/pi-web`（当前为 `@xupeng/pi-web`，scope 必须改）
   - 版本号 → `0.9.0`（用 `npm version 0.9.0 --no-git-tag-version` 或手动改）
   - 可加 `"publishConfig": {"access": "public"}`（scoped 包默认私有，发布命令也会带 `--access public`，二者取其一）。
3. **README ×4 修正**（`README.md` / `README.zh-CN.md` / `README.ja.md` / `README.ru.md`）：
   - 标注 fork 来源：如 `Forked from [agegr/pi-web](https://github.com/agegr/pi-web) (MIT)`
   - Quick Start 安装命令 `npx @agegr/pi-web@latest` → `npx @xup3ng/pi-web@latest`
   - 截图热链：统一决策（优先复制 `docs/screenshot2.png` 到本仓库 docs/ 并改链接；或保持 upstream 热链，需在最终摘要中说明）
4. **构建**：`npm run build`（`next build --webpack`；AGENTS.md 提示这会写 `.next/`，属发布预期操作，发布后再 `npm run dev` 前若异常按 dev 故障流程处理）。
5. **dry-run 验证**：`npm publish --dry-run`，确认产物含 LICENSE（含 agegr 版权声明）、README、bin/pi-web.js、.next、public、package.json；检查无多余文件。
6. **真实发布**：`npm publish --access public`（scoped 包需 public；启用 2FA 后 CLI 会提示输入 OTP，或 `--otp=XXXXXX`）。
7. **发布后验证**：
   - `npm view @xup3ng/pi-web`（版本 0.9.0、license MIT、bugs 指向本仓库）
   - 全新临时目录 `npx @xup3ng/pi-web@latest` 启动，确认监听 30141、无报错退出（Ctrl+C 结束）。
8. **git 提交**：提交 package.json + README×4 + 新增 docs/screenshot2.png（若复制）+ 版本 bump，`git status` 干净。

## 验证命令

```bash
npm whoami
npm publish --dry-run
npm publish --access public
npm view @xup3ng/pi-web
cd $(mktemp -d) && npx @xup3ng/pi-web@latest
```

## 风险点 / 回滚

- **npm 登录交互**：`npm login` 需要用户终端操作，无法自动化时停下询问。
- **版本号不可覆盖**：npm 禁止重发同版本。发布成功后发现错误只能 bump 新版本（0.9.1），无法撤回 0.9.0（仅能 unpublish 72h 窗口内，谨慎使用）。
- **`.next/` 污染**：发布构建会重写 `.next/`，若后续 `npm run dev` 异常，按 AGENTS.md 的 dev 故障流程（备份 .next → 重启）处理。
- **npx 首次下载**：验证 `npx` 启动时若网络慢，加大超时；以服务器日志出现监听端口为准。
