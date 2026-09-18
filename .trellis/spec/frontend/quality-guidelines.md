# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

### 验证基线必须来自与锁文件一致的依赖树

在同一个 checkout 上先后跑过 `pnpm install` / `npm install`、并跨任务复用 `node_modules` 时，
`node_modules` 可能与 `package-lock.json` 已经不一致；此时 lint / 单测的"历史基线"数字不可当锚点。

- 事实案例（2026-09-18，合上游 9 个提交时）：主 checkout 上 `npm run lint` 报
  **14 条** `react-hooks/preserve-manual-memoization`（ChatInput/ChatMinimap/SessionSidebar），
  而同一提交用 `package-lock.json` 做干净安装（`git worktree add` + `npm ci`）后是 **0 条**；
  那次 `npm install` 顺手 `removed 313 packages`，说明旧树确实与锁不一致。
  规则严重级别（`--print-config` 仍为 `error`）、lint 覆盖文件数（462）、
  `eslint-config-next` 的 `dist` 内容、`eslint-plugin-react-hooks` 版本（7.0.1）逐项核对后，
  结论只能是"旧树造成的幻影诊断"，不是源码状态。
- 因此：报告"lint 无新增诊断"时，必须同时给出**基线是怎么得到的**（哪个依赖树、哪次安装），
  并在诊断数量发生变化时做归因（规则级别 / 文件覆盖数 / 插件与 config 版本 / 依赖树一致性），
  不允许用"数字变小了"直接当通过。
- 交叉验证首选：`git write-tree` + `git commit-tree`（不写任何 ref）拿到候选树，
  在独立 worktree 里 `npm ci` 后复跑 tsc / lint / `npm test`，
  这样既隔离了并发会话的未提交改动，也保证依赖来自锁文件。
  **不要**把带 `node_modules` 的临时 worktree 建在 `/tmp`（本机 `/tmp` 是 2 GiB tmpfs，
  两个 `node_modules` 就会 `ENOSPC`）；用仓库同级的普通目录。
- 提交前的最小集合：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`
  三者退出码为 0，且计数与基线逐项对照记录在任务 `research/` 下。

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)
