# 确认来源并移除 append instructions 功能

## Goal

确认设置中的 Append instructions 属于本 fork 新增、上游没有同等入口，然后移除该 Web 编辑功能，减少分支维护负担，不改变原生提示词语义或用户文件。

## Background and Confirmed Facts

- 当前工作基线为 `personal@06a80df`。2026-10-06 已通过 `git ls-remote --symref for-sync HEAD` 和 `git fetch for-sync` 核对上游默认分支 `main`，固定比较对象为 `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`。
- `82b7654c2fd682b94f21c099db411a17b056f0c8` 新增编辑 API 和读写 helper；`bc36f7bf1e81e5997a143c0a470beaad2738b7c6` 新增设置编辑器。两者作者均为 xupeng，提交日期为 2026-09-27，存在于 `personal`，均不是上游 `main` 的祖先。
- 上游设置枚举不含 `append-system`，没有对应组件、路由和 helper。`for-sync/main:lib/project-trust.ts:180` 仍识别 `APPEND_SYSTEM.md`：原生加载及信任边界与 Web 编辑入口不是同一功能。
- 当前入口位于 `components/SettingsPanel.tsx:35,74,515,617`，专属类型位于 `lib/api-types.ts:57–69`，CSS 位于 `app/settings.css:1951–2038`，三语文案各有 21 个 `settings.appendSystem*` key。
- `lib/settings-navigation.ts` 已对未知持久化 section 回退 General；只需退出枚举并验证旧值，不需要清空设置存储。
- `components/SettingsPanel.ask-user-retirement.test.mjs:77` 仍有编辑器断言；`lib/append-system.test.mjs:134–173` 含应保留的 SDK 原生加载回归。
- 详细证据与保护清单见 `research/provenance-and-scope.md`。用户于 2026-10-06 在最终规划摘要之后明确确认：仅移除 fork 编辑器与 API，保留 SDK 原生加载和已有用户文件，授权按本范围实现。

## Requirements

- R1（来源）：以固定上游提交与 Git 历史报告 fork 编辑器的来源，并明确它与 SDK 原生能力的区别。
- R2（退役）：桌面与移动设置不再显示 Append instructions；移除专用组件、GET/PUT API、helper、DTO、CSS、三语文案及专属编辑测试；不保留伪兼容端点。
- R3（兼容）：旧 `section: "append-system"` 导航安全回退 General，不清空其他 pane 的选择；Models、Skills、Agents、Plugins、MCP、General 的行为、reload、trust、Escape 与挂载规则不变。
- R4（保护）：保留 SDK 的全局/受信项目 `APPEND_SYSTEM.md` 发现及覆盖语义、项目信任检查、Chat only 和内建子代理的现行提示边界；不读取、改写、删除或迁移真实用户文件，不自动 reload/rebuild 会话。
- R5（文档）：当前 file map、目录树与规范不得继续宣称编辑器/API 可用。编辑器 ADR 和专属 spec 标记退役并明确原生能力仍保留；历史任务、journal、旧验证产物不重写。

## Acceptance Criteria

- [x] AC1：给出新增提交、作者、日期、固定上游对照及不在上游祖先链的证据（R1）。
- [x] AC2：桌面 tabs 和移动 picker 无该入口，打开设置不请求 `/api/append-system`，专用路由不再暴露 GET/PUT（R2）。
- [x] AC3：专属文件与生产引用清除，三语 key 集合一致；周边设置测试保留，旧导航回退且其他 selections 保留（R2、R3）。
- [x] AC4：隔离 SDK fixture 验证全局加载及受信项目覆盖仍成立；Chat only、子代理、项目信任回归通过；真实用户文件和运行会话未被触碰（R4）。
- [x] AC5：当前文档与退役状态一致，无新增悬空链接，历史记录保持原样（R5）。
- [x] AC6：干净、锁文件一致的 `npm ci --include=dev` 依赖树下 tsc、lint、全量单测通过；浏览器与源码/数据链证据分开记录，未覆盖平台明确披露（R2–R5）。

验收证据：`research/verification.md`；其中明确区分源码/SDK 回归与实际 Chromium/HTTP，并披露未运行 Safari、Windows、完整 e2e suite 和浏览器 trust/reload 写入流程。

## Out of Scope

- 禁用或替换 pi SDK 原生 `APPEND_SYSTEM.md` 机制。
- 清空用户追加指令内容、删除已有全局/项目文件、改变项目安全策略或提示词合成。
- 自动重启运行会话、修改 shared reload 协议、清空 localStorage。
- 更新 SDK、依赖、版本号、发布 npm 包、同步上游代码或改动其他设置功能。

## Review Gate

R2–R5 移除边界已由用户确认。进入实现前检查工作区并执行 `task.py start`；如发现需要禁用原生加载，必须重新规划而非扩大本任务实现。
