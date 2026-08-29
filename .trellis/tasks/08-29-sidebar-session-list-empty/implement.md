# 实施计划：竞态修复 + handleAgentEnd 轻量刷新

## 顺序与依赖

1. **服务端（先做，客户端依赖其行为）**
   - `lib/session-reader.ts`：从 `loadAllSessions` 提取 `toSessionInfo` helper（含 subagent/fork relation 语义）；新增并导出 `readSessionById(sessionId)`（定向定位 + 单文件读取 + 单文件 parent 解析 + project 附加）。
   - `app/api/sessions/route.ts`：`sessionId` 分支改为 `readSessionById` + runtime 合并（不再全量 `listAllSessions`）。
2. **客户端竞态修复（SessionSidebar.tsx）**
   - `loadProjects`：删除 force 清空缓存分支（改动 A）。
   - refreshKey effect：串行化（改动 B）。
   - `loadProjectSessions`：per-key 序号乱序保护（改动 C）。
3. **客户端轻量刷新**
   - `SessionSidebar.tsx`：新增 `sessionActivity` prop、`refreshSessionRow`、监听 effect。
   - `AppShell.tsx`：`handleAgentEnd` 移除 `setRefreshKey`，新增 `sessionActivity` state 与传递；结构变更路径的 `setRefreshKey` 保留。
4. **验证**：见 design.md §4；`tsc --noEmit` + `npm run lint`。

## 风险与对策

- `toSessionInfo` 提取改变 `loadAllSessions` 组装路径 → 单测/手动比对列表摘要字段一致。
- `readSessionById` 中 parent 解析失败（parent 文件缺失）→ 返回无 parentSessionId 的行，与现状 listAllSessions 行为一致（`originSessionId` 为 undefined）。
- 乱序保护误伤：seq 只影响同 key 的并发请求，无并发时行为不变。
- 会话行更新后项目排序滞后：接受（下次全量纠正），不做本地重排以免扰动。
