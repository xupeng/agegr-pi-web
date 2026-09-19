# 下次发布带上 Cascadia Code 许可文件并核验产物清单

## Goal

0.9.4 的 tarball 缺 public/fonts/LICENSE-cascadia-code.txt 与 NOTICE.txt（0.9.3 有）；仓库已在 5129887 恢复两文件并加 public/fonts.test.mjs 回归保护。本任务只负责：下次 npm 发布时确认产物清单包含这两个文件。

## Requirements

- **R1 背景（已发生的事实）**：`@xup3ng/pi-web@0.9.4`（2026-09-18 发布）的产物里
  **没有** `public/fonts/LICENSE-cascadia-code.txt` 与 `public/fonts/NOTICE.txt`，
  而 `0.9.3` 有。四个 Cascadia Code woff2（SIL OFL 1.1）因此缺少许可证文本。
  成因：两个文件由任务 `09-13` 在隔离 release 目录内补写，从未进入仓库；
  0.9.4 从主 HEAD 构建，故丢失。详见
  `.trellis/tasks/archive/2026-09/09-18-sync-upstream-post-v091/research/release-report.md` §14（勘误）。
- **R2 仓库侧已修**：`5129887` 从 registry 上已发布的 0.9.3 tarball **字节级**恢复两个文件，
  并新增 `public/fonts.test.mjs`（断言许可与 NOTICE 存在、NOTICE 列出每个字体、
  且每个声明的 SHA-256 与打包文件一致）。本任务**不重复**这部分工作。
- **R3 本任务唯一目标**：**下一次** npm 发布（0.9.5 或任何后续版本）时，
  确认产物清单包含这两个文件，并把核验证据写进该次发布的报告。
- **R4 核验方式**：在隔离 release root 内 `npm pack` 后
  `tar -tzf <tgz> | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'`
  必须命中 2 条；且 `public/fonts.test.mjs` 在该次发布的源码树内通过。
- **R5 边界**：本任务不发布、不改版本号、不动 `09-13` 已归档的记录；
  不覆盖已发布的 0.9.4（其内容保持原样，缺陷通过后续版本修复）。

## Acceptance Criteria

- [ ] **AC1（R3、R4）**：下一次发布的 tgz 清单里同时含 `public/fonts/LICENSE-cascadia-code.txt`
  与 `public/fonts/NOTICE.txt`（给出 `tar -tzf` 原始输出）。
- [ ] **AC2（R4）**：该次发布的源码树内 `node --test public/fonts.test.mjs` 通过（2/2）。
- [ ] **AC3（R3）**：核验证据写入该次发布任务的 `research/` 报告，
  并注明"0.9.4 缺项已由本版本修复"。
- [ ] **AC4（R5）**：未对已发布的 0.9.4 做任何改动（registry 上其 integrity 与
  `sha512-WX+LIbwPxXCMnTZlK1xirhq9JZnU5UX4QugcoZ2J/X801ba+PCh7lqXpQRxiJKVe4APe4b1DOunaehLoEzwXmw==`
  一致）。

## Out of Scope

- 重新发布或撤回 0.9.4。
- 字体文件本身的替换/子集化；`NOTICE.txt` 内容改写（其声明的 4 个 woff2 SHA-256
  与仓库文件已核对为 4/4 一致）。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
