# Append instructions 编辑器退役设计

## 状态与最小行为差异

2026-10-06 用户已确认本设计范围。现状是本 fork 提供原生全局文件的 Web 编辑器；目标是取消这个入口及专属 API，而不是取消 SDK 原生文件加载。实现基于任务特性分支，base 为 `personal`。

## 两条独立数据链

待删除链路：

`SettingsPanel → AppendSystemConfig → /api/append-system GET/PUT → lib/append-system.ts → 全局 APPEND_SYSTEM.md`

保留链路：

`普通会话服务 → SDK DefaultResourceLoader → 项目信任闸门 → 受信项目文件或全局文件 → 系统提示`

编辑 helper 不是普通会话注入 owner；不修改 `lib/rpc-manager.ts`、`lib/chat-only.ts`、`lib/subagent-prompt.ts`、`lib/subagent-runtime.ts`、`lib/project-trust.ts` 或 SDK。`appendSystemPrompt` 历史 snapshot 字段、exact-system-prompt、shared 原子写和 reload 仍保留。

## 文件级变更

1. 删除专属六文件：组件及测试、API 路由及测试、读写 helper 及测试。
2. `SettingsPanel.tsx` 仅删除 import、图标、section 配置和 sectionHost；保留共享 trust/reload props、General 保存逻辑、移动壳、Escape/focus 与 visited panes。
3. `settings-navigation.ts` 仅收缩 section 枚举；已有 `isSettingsSection()` 校验提供 General 回退。不新增存储迁移，不删除其他 selections，不改 `PROJECT_SECTIONS`。
4. `api-types.ts` 删除两个 DTO；`settings.css` 删除专属 `.append-system-*` 区块；三语各删除 21 个 `settings.appendSystem*` key，不动共享 reload/saved 文案或 config 样式。
5. 更新 `SettingsPanel.test.mjs` 与 AskUser retirement 测试，保留 MCP 无项目恢复等无关回归。新增旧导航恢复与退役残留断言。
6. 将现有两条 SDK 加载测试迁入 `lib/append-system-retirement.test.mjs`（仅测试，不恢复生产 helper），使用 fixture 直接 `writeFile()`；保留全局发现、无文件、未受信项目读全局、受信项目覆盖的真实 SDK 断言。
7. 更新 `AGENTS.md`、spec 目录树；将编辑器 spec 与 ADR 标记退役，保留可核对的来源与原生语义，调整 spec 索引描述。`docs/agents/tools.md` 简述当前原生行为及无 Web 编辑入口。不得按 `0005-*` 批量删除：另有内建子代理 ADR。

## HTTP 兼容与会话生命周期

- 删除 Next 路由，GET/PUT 不再提供编辑协议；不新增固定成功、固定启用或禁用的兼容路由。
- 旧浏览器 section 自动回退 General，其他 pane 记忆保留；旧页面缓存可能仍有旧入口，刷新采用新界面。
- 不调用自动 reload、重建或清空 wrapper；SDK 在原有创建/重载时继续发现磁盘文件。外部手工编辑与信任规则不变。
- 编辑器 64 KiB 上限随 writer 退役，不把这个 Web 写入上限新加到 SDK 读取链。

## 取舍、风险与回滚

- 使用精确语义移除，不整块 revert 两个历史提交，避免损坏其后重构、AskUser 退役和共享 Settings UI。
- 清除专属测试但迁移原生回归，避免“删掉测试就没有失败”的假退役证据。
- 保留退役 spec/ADR 是为了防止未来恢复编辑器或误删 SDK 功能；历史 archive/journal 不改。
- 浏览器验收需要锁文件一致的候选树和隔离 agent HOME。只能保留本任务的证据与进程；未测 Safari/Windows 明确披露。
- 回滚以还原本任务特性分支的精确变更为准；不涉及用户数据迁移或撤销 SDK 配置。
