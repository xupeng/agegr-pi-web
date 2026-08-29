# 设计：竞态修复 + handleAgentEnd 轻量刷新

## 1. 竞态修复（R1）

### 1.1 根因回顾

`handleAgentEnd`（每轮对话结束）→ `setRefreshKey++` → SessionSidebar refreshKey effect 并发发起两个请求：

```
void loadProjects(false, true)            → GET /api/projects?force=1（全量重扫，慢）
void loadProjectSessions(key, true)       → GET /api/sessions?projectKey=…（30s 缓存命中，快）
```

`loadProjectSessions` 先返回并写入 `projectSessionsByKey` 缓存；随后 `loadProjects` 返回，其 force 分支执行
`projectSessionsByKeyRef.current = new Map()` 清空**所有项目**缓存，且该 effect 只跑一次、清空后无重拉 → 列表持续为空。

### 1.2 改动 A：force 不再清空缓存（SessionSidebar.tsx `loadProjects`）

删除 force 分支中的缓存清空（两行），旧列表保留到新数据就绪：

```ts
// 删除：
if (force) {
  projectSessionsByKeyRef.current = new Map();
  setProjectSessionsByKey(new Map());
}
```

效果：force 只影响项目列表本身与"跳过客户端缓存检查"的重拉；会话行在重拉返回前显示旧数据。删除/重命名的会话会在对应 loadProjectSessions 响应后消失/更新（短暂滞后可接受）。

### 1.3 改动 B：refreshKey effect 串行化（SessionSidebar.tsx）

```ts
useEffect(() => {
  const isFirst = !initialLoadDone.current;
  initialLoadDone.current = true;
  void (async () => {
    await loadProjects(isFirst, !isFirst);
    if (!isFirst && selectedProjectKeyRef.current) {
      await loadProjectSessions(selectedProjectKeyRef.current, true);
    }
  })();
}, [loadProjects, loadProjectSessions, refreshKey]);
```

`loadProjects` 内部 catch 错误不 throw，`await` 不会中断；`loadProjectSessions` 一定在项目列表更新后执行，且使用最新的 `selectedProjectKeyRef`。

### 1.4 改动 C：loadProjectSessions 乱序保护（防御）

refreshKey effect（串行）与轮询/手动 `refreshLists`（串行）是独立调用方，同一 projectKey 的请求仍可能并发 in-flight（force 时跳过客户端缓存检查）。用 per-key 递增序号，只接受最新请求的响应：

```ts
const projectSessionsReqSeqRef = useRef(new Map<string, number>());

const loadProjectSessions = useCallback(async (projectKey: string, force = false) => {
  if (!force) {
    if (projectSessionsLoadingRef.current.has(projectKey)) return;
    if (projectSessionsByKeyRef.current.has(projectKey)) return;
  }
  projectSessionsLoadingRef.current.add(projectKey);
  setProjectSessionsLoadingKey(projectKey);
  const seq = (projectSessionsReqSeqRef.current.get(projectKey) ?? 0) + 1;
  projectSessionsReqSeqRef.current.set(projectKey, seq);
  try {
    const res = await fetch(`/api/sessions?projectKey=${encodeURIComponent(projectKey)}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { sessions: SessionInfo[] };
    if (projectSessionsReqSeqRef.current.get(projectKey) !== seq) return; // 过期响应丢弃
    projectSessionsByKeyRef.current.set(projectKey, data.sessions);
    setProjectSessionsByKey((prev) => { /* 同现状 */ });
    onSessionsChange?.(mergeLoadedSessions(projectSessionsByKeyRef.current));
  } catch (e) {
    setError(String(e));
  } finally {
    if (projectSessionsReqSeqRef.current.get(projectKey) === seq) {
      projectSessionsLoadingRef.current.delete(projectKey);
      setProjectSessionsLoadingKey((cur) => (cur === projectKey ? null : cur));
    }
  }
}, [onSessionsChange, mergeLoadedSessions]);
```

## 2. handleAgentEnd 轻量刷新（R2）

### 2.1 前提修正：`?sessionId=` 当前并非定向读取

现状 `app/api/sessions/route.ts` 的 sessionId 分支调用 `listAllSessions()`（全量增量扫描）后过滤——只有 30s 内存缓存命中时才轻量。要兑现"定向单会话查询、不触发全量扫描"，需改造服务端。

### 2.2 服务端：新增 `readSessionById`（lib/session-reader.ts）

从 `loadAllSessions` 中提取条目→`SessionInfo` 组装逻辑为可复用 helper：

```ts
/** 组装单个 CachedSessionEntry 为 SessionInfo；resolveParentId 由调用方提供 */
async function toSessionInfo(
  info: CachedSessionEntry,
  resolveParentId: (parentPath: string) => Promise<string | undefined>,
): Promise<SessionInfo> { /* 含 parentSessionId、subagent/fork relation，同 loadAllSessions 语义 */ }

/** 定向读取单个会话文件，不触发全量扫描、不 invalidate 内存缓存 */
export async function readSessionById(sessionId: string): Promise<SessionInfo | null> {
  const path = await resolveSessionPath(sessionId); // 定向定位（path cache → 文件名匹配），兜底全量
  if (!path) return null;
  let mtimeMs: number;
  try { mtimeMs = (await stat(path)).mtimeMs; } catch { return null; }
  const info = await readSessionInfoFast(path, mtimeMs);
  if (!info) return null;
  cacheSessionPath(info.id, info.path);
  const parentId = info.parentSessionPath
    ? await resolveSessionIdByPath(info.parentSessionPath) // 单文件定向解析，不走全量
    : undefined;
  const session = await toSessionInfo(info, async () => parentId);
  const [withProject] = await attachSessionProjectInfo([session]); // 附加 projectRoot/projectKey/branch
  return withProject ?? null;
}
```

子代理 relation（`readSubagentRun`）逻辑一并移入 `toSessionInfo`，保持与列表语义一致。

### 2.3 服务端 route：sessionId 分支改定向（app/api/sessions/route.ts）

```ts
} else if (sessionId) {
  // 定向读取单个 .jsonl（毫秒级），不触发全量扫描；瞬时会话合并 runtime 版本
  const [persistedTarget, runtimeTarget] = await Promise.all([
    readSessionById(sessionId),
    getRpcSessionInfos().find((s) => s.id === sessionId),
  ]);
  sessions = persistedTarget ? [persistedTarget] : runtimeTarget ? [runtimeTarget] : [];
}
```

注意：`projectKey`/`sessionId` 分支互斥；projectKey 分支保留全量路径（本来就按需）。URL restore / 瞬时会话 hydration 也受益（更快的单会话查找）。

### 2.4 客户端：新 prop `sessionActivity` 信号（AppShell → SessionSidebar）

AppShell.tsx：

```ts
const [sessionActivity, setSessionActivity] = useState<{ id: string; ts: number } | null>(null);

const handleAgentEnd = useCallback(() => {
  if (selectedSession) setSessionActivity({ id: selectedSession.id, ts: Date.now() });
  setExplorerRefreshKey((k) => k + 1);          // 文件树刷新保留
  if (selectedSession) hydrateSelectedSession(selectedSession.id); // 会话内容刷新保留
  // …通知逻辑不变
}, [selectedSession, …]);
```

删除 `handleAgentEnd` 中的 `setRefreshKey((k) => k + 1)`（全量 force 不再由每轮对话结束触发）。结构变更路径（`handleSessionCreated/Deleted/Forked`、重命名）的 `setRefreshKey` 全部保留。

SessionSidebar.tsx：

```ts
// Props 新增：sessionActivity?: { id: string; ts: number } | null

/** 定向刷新单个会话行 + 同步项目行 modified（毫秒级，不触发全量扫描） */
const refreshSessionRow = useCallback(async (sessionId: string) => {
  try {
    const res = await fetch(`/api/sessions?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json() as { sessions: SessionInfo[] };
    const updated = data.sessions?.[0];
    if (!updated) return;
    const key = updated.projectKey ?? updated.projectRoot ?? updated.cwd;
    // 更新 per-project 缓存中对应行（遍历所有已缓存项目，该行可能属于任一项目）
    const nextByKey = new Map(
      [...projectSessionsByKeyRef.current.entries()].map(([k, list]) => [
        k,
        k === key ? list.map((s) => (s.id === sessionId ? updated : s)) : list,
      ]),
    );
    projectSessionsByKeyRef.current = nextByKey;
    setProjectSessionsByKey(nextByKey);
    // 同步项目行 modified（若更大），保持最近活跃排序
    setProjects((prev) => {
      const next = prev.map((p) => (p.key === key && updated.modified > p.modified ? { ...p, modified: updated.modified } : p));
      return next;
    });
  } catch { /* 轻量刷新失败保持现状，下次全量刷新纠正 */ }
}, []);

useEffect(() => {
  if (!sessionActivity?.id) return;
  void refreshSessionRow(sessionActivity.id);
}, [sessionActivity, refreshSessionRow]);
```

项目排序：更新 modified 字段；数组顺序由下次全量 `loadProjects` 纠正（每轮对话后项目行最多滞后一次排序，可接受；不做本地 sort 以免扰动 UI）。

## 3. 不改动项

- 服务端 `listAllSessions` 的 30s 内存缓存 / 磁盘 mtime 缓存 / generation 机制（性能基础）。
- 运行轮询（2.5s）、未读标记、`refreshLists(true)` 串行语义、手动刷新按钮。
- 结构变更（创建/删除/fork/重命名）仍走 `setRefreshKey` → 全量 force。

## 4. 验证路径

1. dev server 运行中完成一轮对话 → 观察 `/api/sessions?sessionId=` 请求出现且无 `/api/projects?force=1` 伴随；列表保持非空并更新该行 modified。
2. 快速连续多轮对话 → 列表不空、无竞态闪烁。
3. 手动刷新 / 切换项目 / 创建删除 fork 重命名 → 行为与现状一致。
4. `tsc --noEmit`、`npm run lint` 通过。
