# GitHub Actions 自动发布 personal tarball

## 背景
`scripts/release-personal.sh` 目前手动完成：bump version → next build → npm pack → push 分支/tag → gh release create。
本地跑一次 build 慢且依赖本机环境。把「构建+发布」搬进 GitHub Actions，本地只负责版本管理。

## 需求（用户已确认）
1. **触发**：push `personal-*` tag 自动触发 build+release
2. **版本号**：本地 bump+commit+push tag；CI 不做版本管理
3. **产物**：保持预构建 tarball（next build + npm pack），不推 npm registry
4. 发布 notes 照搬现有脚本：相对上一 personal tag 的 changelog + npm/pnpm 安装命令
5. 本地脚本瘦身：只做前置检查 + bump + commit + push 分支 + push tag（保留代理，push 仍走本地代理）

## 验收标准
- `.github/workflows/release-personal.yml` 存在且语法正确（yaml 可解析）
- push `personal-0.8.x.N` tag 时：checkout → pnpm install --frozen-lockfile → next build --webpack → npm pack → gh release create（含 changelog 与安装命令）
- tag 解析版本号正确：`personal-0.8.9.2` → `0.8.9-personal.2`，tarball 名 `xupeng-pi-web-0.8.9-personal.2.tgz`
- 防护：package.json version 与 tag 不一致时 fail（防止手打 tag 产生错误的 tarball 名）；tag 已有 release 时跳过不覆盖
- 瘦身后的 `release-personal.sh` 不再调用 next build / npm pack / gh
- 现有安装命令不变：`npm install -g <tarball-url>` / `pnpm add -g <tarball-url>`

## 非目标
- 不发布 npm registry
- 不改 tarball 内容/安装方式
- 不处理 main 分支发布
