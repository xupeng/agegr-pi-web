# 为独立发布到 npmjs 做准备

## Goal

将 `@xup3ng/pi-web` 作为独立包发布到 npmjs：协议合规（MIT 保留版权声明）、包元数据完善、README 来源声明与安装命令修正，并以 `0.9.0` 完成首次真实发布，`npx @xup3ng/pi-web@latest` 可启动。

## Background（已确认事实，来自仓库证据）

- upstream `agegr/pi-web` 为 MIT License（LICENSE + package.json `"license": "MIT"`），明确允许 fork、修改、重新发布到 npmjs；唯一义务是所有副本/实质性部分保留版权声明（`Copyright (c) 2026 agegr`）。本地 LICENSE 原样保留 ✓。
- 包名 `@xup3ng/pi-web` 在 npm registry 上未被占用（`npm view` 返回 404），无包名冲突。
- npm 用户名 `xupeng` 已被他人注册（PUT claim 返回 401 "username or password was invalid"），且不能创建同名 org（用户名与 org 名共享命名空间），故原计划包名 `@xupeng/pi-web` 不可用。
- 用户已注册 npm 账号，用户名 `xup3ng`（注册过程中曾遇 Cloudflare 临时拦截，换 IP 后成功）；scope 用用户名 `xup3ng` 即可发布，无需创建 org。
- `package.json` 已具备：`license: MIT`、`files` 字段（bin/.next/public/next.config.ts/package.json）、`bin: pi-web`、`engines: node >=22.19.0`、`release` 脚本（`npm version patch --no-git-tag-version && npm run build && npm publish --access public`）。
- 需要修正（与 upstream 残留相关）：
  - `bugs` 字段仍指向 `https://github.com/agegr/pi-web/issues`，应改为本仓库。
  - README（4 种语言）未标注 fork 来源；Quick Start 的 `npx @agegr/pi-web@latest` 仍是 upstream 包名。
  - README 截图热链指向 `raw.githubusercontent.com/agegr/pi-web/main/...`。
- 当前 npm 已登录（用户名 `xup3ng`，2026-08-30 用户确认）。
- 当前版本号 `0.8.11-personal.11` 是 prerelease 语义（`0.8.11-personal.x`），直接 `npm publish` 会以 prerelease 发布。

## Requirements

- 协议合规：发布产物保留 MIT LICENSE 及原版权声明（不得删除 `Copyright (c) 2026 agegr` 行）。
- 包元数据：`bugs` 指向本仓库 issues；补充 author、keywords 字段。
- README（en/zh-CN/ja/ru 4 种语言）：标注 fork 来源（forked from agegr/pi-web）；安装命令改为 `@xup3ng/pi-web`；截图等资源链接统一处理（复制到本仓库 docs/ 或保持热链）。
- 版本号：改为稳定 semver `0.9.0`（用户已确认），git 提交一并记录。
- 发布执行：手动发布流程（版本号改 0.9.0 → build → publish），发布前 dry-run 验证产物。
- 发布后验证：`npm view @xup3ng/pi-web` 元数据正确；`npx @xup3ng/pi-web@latest` 在全新目录可启动。

## Acceptance Criteria

- [ ] `npm publish --dry-run` 产物包含 LICENSE（含 agegr 版权声明）、README、bin/pi-web.js、.next、public。
- [ ] package.json 的 `bugs` 指向本仓库 issues；`npm view` 元数据字段完整。
- [ ] README 标注 fork 来源，安装命令为 `@xup3ng/pi-web`。
- [ ] `@xup3ng/pi-web@0.9.0` 真实发布成功（含 npm 登录），`npx @xup3ng/pi-web@latest` 在全新目录可启动服务器。
- [ ] 发布后 git 提交：版本号 bump + 元数据/README 改动，`git status` 干净。

## Out of Scope

- GitHub Actions / CI 自动发布（用户选择手动发布）。
- 改动 upstream 的 `@earendil-works/pi-*` 依赖本身的协议或发布。
- 功能开发（如后续 personal 特性继续迭代）。

## Key Decisions

- 发布范围：包含一次真实发布（publish_real）。
- 版本号：首个 npm 版本用稳定 semver `0.9.0`（stable_090）。
- 发布方式：手动执行，不配置 CI。
- 包名：`@xup3ng/pi-web`（npm 用户名 xup3ng 作 scope；xupeng 用户名被占用不可用）。

## Notes

- 轻量到中等任务：PRD + 精简 implement.md（有序执行清单）。
