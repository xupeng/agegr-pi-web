# 会话恢复与 URL 优先级

> 覆盖"`?session=` 深链首屏恢复"与"工作区记忆恢复"的先后顺序。两者都会调用 `setSelectedSession`，但只有工作区记忆那条路会改写 URL —— 顺序错了就会出现"界面显示 A、URL 是 B"，下一次 reload 落到 B。

---

## 两条恢复路径

| 路径 | 入口 | 读什么 | 会写 URL 吗 |
|------|------|--------|-------------|
| URL 深链恢复 | `components/SessionSidebar.tsx:1058-1090`（effect）→ `onSelectSession(target, true)` | URL 的 `?session=` | 不会（`isRestore` 且 URL 已带同一 `?session=` 时跳过 `router.replace`，`components/AppShell.tsx:856-859`） |
| 工作区记忆恢复 | `components/AppShell.tsx:721` `handleCwdChange` 的跨项目分支 → `restoreWorkspaceContext`（`:671`） | `getLastOpenSession(projectKey)`（`lib/workspace-memory.ts:46`，localStorage key `pi-web:last-open-by-workspace`） | 会（`:704` `router.replace('?session=' + s.id)`） |

> 合并上游 `ef1de89` 后恢复是三层的：URL `?session=` > 本标签页的 `sessionStorage`（`lib/tab-session.ts`）> 工作区记忆。标签页记忆在挂载后的 layout effect（`components/AppShell.tsx:592-597`）里用 `withTabOpen()`（`lib/initial-navigation.ts`）套到 URL 快照上，只在 URL 既无 `?session=` 也无 `?cwd=` 时生效，填入会话后同样把 `initialSessionRestored` 置 false，所以下面的不变量对三层都成立。

工作区记忆由 `useEffect(() => setLastOpenSession(...), [selectedSession])`（`components/AppShell.tsx:611-618`）写入，**所以只有会话被采纳之后才更新**。新文档里第一次读到的仍是上一个文档留下的值。

---

## 不变量

1. **URL 的 `?session=` 在它被采纳（或确认不存在）之前压过工作区记忆。**
   守卫在 `components/AppShell.tsx:758-762`，判定逻辑是纯函数 `canRestoreRememberedSession()`（`lib/session-restore.ts:28`）：`!initialSessionRestored && hasUrlSession` 时禁止恢复。`initialSessionRestored` 初始值来自 `!initialSessionId`（`:587`），在采纳时置 true（`:845`）或确认不存在时置 true（`:1081`）。
2. **`initialSessionRestored` 是"本 URL 的会话已经落定"的唯一标记**，不要用 `selectedSession !== null` 之类替代：侧栏 effect 与父组件 effect 的执行顺序（子先父后）让同一个 commit 里的 `selectedSession` 闭包可能还是旧值。
3. **跨项目分支才做恢复。** 同项目/同 cwd 的 cwd 上报必须走早退（`components/AppShell.tsx:747-753`），`restoreWorkspaceContext` 只能出现在 `if (currentProject !== newProject)` 内（`components/AppShell.tsx:789-800`）。
4. **禁止在恢复路径里读 URL 来判断"该不该恢复"**：`handleCwdChange` 末尾的 `router.replace(pathname)` 会先把 `?session=` 抹掉（`:764`），等到异步 fetch 返回时 URL 已经不含会话，判断恒为"可以恢复"。必须在调用点同步读取（`:723`，`urlSessionParam(window.location.search)`）。
5. **`?cwd=` 深链不受影响**：`getInitialNavigation()` 在有 `?cwd=` 时返回 `sessionId: null`（`lib/initial-navigation.ts`），`initialSessionRestored` 初值为 true；且该流程在更早的 `suppressCwdBumpRef` 分支就返回了。
6. **记忆键是服务端项目身份**（worktree 与主仓共享一格，`lib/workspace-memory.ts` 顶部注释），所以同一项目里所有 e2e fixture 会话共用一格记忆 —— 这正是它可以被某一个会话"记得"的原因。

---

## 禁止的模式

- ❌ 在 `handleCwdChange` 的破坏性分支（清空 selection、`setSessionKey(k+1)`、`router.replace(pathname)`）之前不检查 URL 会话是否仍未落定。
- ❌ 把守卫放在 `restoreWorkspaceContext` 内部（见不变量 4）。
- ❌ 用"URL 里有 `?session=` 就永不恢复"这种粗粒度条件：用户主动切换项目时 URL 还留着上一个会话，会连带禁掉正常的记忆恢复（`initialSessionRestored` 就是这个区分）。
- ❌ 为修复顺序问题去重排 `SessionSidebar` 里的 effect：cwd 上报还可能来自 `selectedCwdProp` 同步（`components/SessionSidebar.tsx:1014-1018`）与 worktree 解析，重排只覆盖其中一条。

---

## 测试要求

改动这两条路径时必须同时给出**确定性**证据，不能依赖时序运气：

- 单元层：`lib/session-restore.test.mjs`（真值表）+ `components/AppShell.workspace-memory.test.mjs` 里"an unresolved ?session= blocks the remembered-session restore"（在 vm 里执行真实 `handleCwdChange` 源码，断言未发出 `projectKey` 请求、未清空 selection、未 bump `sessionKey`）。
- 端到端：`e2e/session-restore.mjs`（由 `e2e/run.mjs:419` 调用）把"上一个文档留下的记忆"写成确定状态（渲染会话 → 把 `pi-web:last-open-by-workspace` 里所有工作区都指向另一个会话 → 重新以 `?session=` 打开），然后断言 URL 仍指向显式会话，且 reload 后仍是它。修复前这条断言在 URL 上取到 `null`（`?session=` 被抹掉），修复后通过。
