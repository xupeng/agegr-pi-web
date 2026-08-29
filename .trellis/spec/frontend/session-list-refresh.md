# 会话列表刷新机制与竞态防护

> 左侧栏会话列表的两级按需加载、缓存层级、刷新触发点，以及"强制刷新竞态空列表"的教训与正确模式。

## 架构（两级按需加载）

- `GET /api/projects`：只返回每项目摘要（key/root/modified/sessionCount/runningCount + **完整 session id 集合**），首屏不下载逐条会话摘要。
- `GET /api/sessions?projectKey=<key>`：进入某个项目时按需拉取该项目的会话摘要，客户端按 projectKey 缓存在 `SessionSidebar.projectSessionsByKey`。
- 服务端缓存（`lib/session-reader.ts` + `lib/session-list-cache.ts`，性能基础，**不要破坏**）：
  - 30s 内存快照 `__piSessionListCache` + generation 计数（`force=1` 等 in-flight 结束后 `invalidateSessionListCache()` 再重扫，避免并发双扫描）；
  - 单飞 promise：同一 generation 的并发请求共享一次扫描；
  - 磁盘 mtime 缓存 `~/.pi/agent/pi-web-session-list-cache.json`（0600 原子写）：stat 全部文件（~46ms/3000），只重读 mtime 变化的文件。
- 性能实测：冷启动全量 ~3.6s、warm（磁盘缓存）~54ms、hot（内存）~0ms。

## 刷新触发点矩阵（`SessionSidebar` / `AppShell`）

| 触发 | 路径 | 说明 |
|---|---|---|
| 首次加载 / `refreshKey` 变化 | 串行 `await loadProjects` → `await loadProjectSessions(key, force)` | `refreshKey` 只由**结构变更** bump：创建/删除/fork/重命名（`handleSessionCreated/Deleted/Forked`、重命名） |
| **handleAgentEnd（内容变更）** | `sessionActivity` 信号 → `refreshSessionRow(sessionId)` → `GET /api/sessions?sessionId=` | 只更新当前会话行 + 项目行 modified，**不触发全量 force 重扫** |
| 手动刷新按钮 | `refreshLists(true)`（串行 await） | 项目列表 force + 当前项目会话 force，成功后显示绿色对勾 2s |
| 2.5s 运行轮询 | `GET /api/agent/running` 只 patch `runningCount` | 检测到**新会话出现**（running id 不在已知集合）或**后台会话完成**才 `refreshLists(true)`；后台 tab 暂停轮询 |

### 关键语义

- **内容变更 vs 结构变更**：一次对话结束只改变当前会话的 `modified`/`messageCount`（内容变更）→ 定向单会话刷新；创建/删除/fork/重命名（结构变更）→ 全量 force（30s 内存 TTL 内非 force 看不到新文件）。
- **轮询不救当前会话**：`completedInBackground` 显式排除 `id === selectedSessionId`——当前会话运行结束**不会**触发轮询驱动的刷新，必须由 `handleAgentEnd` 自己负责列表更新。
- 瞬时会话（RPC registry 中、未写盘）的 `?sessionId=` 直接短路返回 runtime 版本（`runtimeTarget?.transient`），不做磁盘查找。

## API 契约：`GET /api/sessions`

三个互斥分支：

| 参数 | 行为 |
|---|---|
| `projectKey` | `listAllSessions({ force })` 全量路径后按 key 过滤（本来就按需） |
| `sessionId` | **定向读取**：transient runtime 短路 → 否则 `readSessionById`（定位单个 `.jsonl`，毫秒级）→ 找不到返回 `[]`；**不触发全量扫描、不 invalidate 内存缓存** |
| `force=1` | `listAllSessions` 等 in-flight → invalidate → 全量重扫 |

`readSessionById`（`lib/session-reader.ts`）流程：`resolveSessionPath`（path 缓存 → 文件名后缀匹配 → 兜底全量）→ 单文件 stat + `readSessionInfoFast` → `toSessionInfo`（parent 用 `findSessionIdByPath` 单文件定向解析，不走全量）→ `attachSessionProjectInfo` 附加 projectKey/branch。

## 竞态教训（forbidden pattern）

**❌ 禁止：force 刷新"先清空 per-project 缓存再拉取"。**

原实现：`loadProjects(force)` 成功后执行 `projectSessionsByKeyRef.current = new Map()`。而 refreshKey effect 并发发起两个请求——`loadProjectSessions` 走服务端 30s 缓存先返回并写入缓存，`loadProjects`（全量重扫）后返回时清空**所有项目**缓存，且该 effect 只跑一次、清空后无重拉 → 列表持续为空，只能手动点刷新恢复。

**✅ 正确模式（`SessionSidebar.tsx` 当前实现）：**

1. **新数据到达后覆盖，不清空旧数据**：force 刷新期间旧行保持可见，`loadProjectSessions(force)` 成功返回后覆盖。
2. **刷新路径串行化**：refreshKey effect 先 `await loadProjects`，再用最新 `selectedProjectKeyRef` 拉会话（`loadProjects` 内部 catch 错误不 throw，await 不会中断）。
3. **per-key 请求序号**（`projectSessionsReqSeqRef`）：同 key 并发请求只接受最新响应（含 finally 中 loading 标记的所有权、catch 中错误状态的写入权）。
4. **stale 标记**（`staleProjectKeysRef`）：force 成功后把其他已缓存项目标记 stale，切换项目时重拉（旧行可见、不空白，删除/重命名的会话在其他项目也能及时消失）。
5. **单行刷新 overrides 合并**（`sessionRowOverridesRef`）：`loadProjectSessions` 写入时合并 `refreshSessionRow` 的新行，防止较早发出的列表响应用 30s 旧快照回退单行新数据。

## 测试要求

- `lib/session-reader.test.mjs`：`readSessionById` 定向读取必须断言 `SessionManager.listAll` mock 计数为 0（不触发全量扫描）。
- `app/api/sessions/runtime-route.test.mjs`：route 源码断言 `runtimeTarget?.transient` 与 `readSessionById(sessionId)`（sessionId 分支不得回退到 `listAllSessions`）。
- 改动刷新逻辑/API 行为时，同步更新上述断言。
