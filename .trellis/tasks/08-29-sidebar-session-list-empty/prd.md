# 修复：会话列表因并发强制刷新竞态而变空

## Goal

消除"会话列表中实际有会话但列表显示为空、需手动点刷新才恢复"的现象。

根因（已通过代码分析确认）：
1. **竞态空列表（主因）**：每轮对话结束 `onAgentEnd → handleAgentEnd → setRefreshKey++`，SessionSidebar 的 refreshKey effect 并发发起 `loadProjects(force)` 与 `loadProjectSessions(force)`。`/api/sessions` 走服务端 30s 内存缓存先返回并写入客户端缓存；`/api/projects?force=1` 全量重扫后返回，其 force 分支清空**所有**项目的会话缓存，且清空后无后续重拉 → 列表持续为空。
2. **轮询不救场**：运行轮询检测"后台完成"的会话时排除当前选中 session（`id !== selectedSessionId`），当前会话结束不触发轮询驱动的 `refreshLists`。
3. **手动刷新能恢复**：`refreshLists(true)` 串行 await（先清空、后重拉），无竞态。

## Requirements

### R1 竞态修复（must）
- force 刷新不再"先清空再拉取"：旧列表保留到新数据就绪，新数据到达后覆盖。
- refreshKey 触发路径串行化：先 `await loadProjects`，再用最新 projectKey 拉取会话。
- 任何刷新路径下（对话结束 / 切换项目 / 手动刷新 / 轮询驱动），列表在数据返回前显示旧数据，而非空白。

### R2 handleAgentEnd 轻量刷新（must，已确认范围）
- `handleAgentEnd` 不再触发全量 force 重扫服务端；改为**定向单会话查询** `GET /api/sessions?sessionId=<id>` 更新当前会话行摘要（modified/messageCount 等），并同步当前项目行的 modified（保持排序）。
- 结构变更（创建 / 删除 / fork / 重命名）仍走全量 force 刷新。

### R3 不回归现有机制（must）
- 按项目 on-demand 加载、per-project 客户端缓存、2.5s 运行轮询、未读标记、手动刷新按钮行为均保持不变。
- 不动服务端 `listAllSessions` 的 30s 内存缓存与磁盘 mtime 缓存（性能基础）。

## Acceptance Criteria

- [ ] 在会话中完成一轮对话后，左侧列表始终非空；刷新期间显示旧数据，完成后显示新数据。
- [ ] 快速连续完成多轮对话（多次触发 handleAgentEnd），列表不出现空状态。
- [ ] 手动刷新按钮行为不变（串行强制刷新 + 成功态反馈）。
- [ ] 创建 / 删除 / fork / 重命名会话后列表正确反映（全量 force 路径保留）。
- [ ] 对话结束后服务端不再发生全量重扫（可观察日志/耗时），轻量路径只读取单个会话文件。
- [ ] `node_modules/.bin/tsc --noEmit` 与 `npm run lint` 通过。

## Notes

- 轻量刷新机制经用户确认采用定向单会话查询（`?sessionId=`），而非本地乐观 patch。
- 该路径服务端 `findSessionPathById` 定向定位单个 `.jsonl` 文件，毫秒级，不 invalidate 内存缓存、不触发全量扫描。
