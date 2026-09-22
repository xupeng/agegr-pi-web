# 14 条 `react-hooks/preserve-manual-memoization` 逐条摘要（插件 7.1.1）

完整原始诊断（302KB，含代码片段）在 `diagnostics-7.1.1.json`；本文件是注入用的紧凑版。
行号对应本任务起始 commit（`personal@5402a5f`）。

## ChatInput.tsx（7 条）

| 位置 | 类 | 诊断要点 |
|---|---|---|
| 940:41 `processImageFiles` | C | deps 仅 `[compact]`；正文读 `attachedImagesRef.current` / `pendingImageCountRef.current` / `pendingImageIdRef.current` / `pendingInlineImagesRef.current`，被判定存在未 memoize 的操作数 |
| 992:40 `saveImagesToDisk` | C | deps `[insertTextAtCursor, cwd]`；正文同样读上述 ref 的 `.current` |
| 1445:41 `getNextSlashIndex` | C | deps `[displayedSlashCommands.length, slashActiveIndex]`；正文读 `slashItemRefs.current` |
| 1486:7 （deps 位）`displayedSlashCommands.length` | B | `This dependency may be modified later` |
| 1489:5 `handleKeyDown` | C | 与 1486/1622 同源（同一 `displayedSlashCommands` 依赖链） |
| 1622:81 （deps 位）`displayedSlashCommands` | B | `This dependency may be modified later` |
| 1622:93 （deps 位）`slashActiveIndex` | B | `This dependency may be modified later` |

成因：`filteredSlashCommands`（`:1196-1208`，每次渲染重建的 IIFE）→
`buildSlashCommandLayout(...)`（`:1210-1216`）→ `displayedSlashCommands`，
这些值每次渲染都是新对象，编译器无法把它们当作稳定依赖。

## ChatMinimap.tsx（5 条，全部为类 A）

统一模式：`scrollContainer` 是 props 传入的 `RefObject`，回调体读 `scrollContainer.current`，
而 deps 写 ref 对象本身 ⇒ `Differences in ref.current access`。

| 位置 | 回调 | 源 deps（诊断原文） | 推断依赖 |
|---|---|---|---|
| 308:36 | `updateScroll` | `[scrollContainer, syncActiveNode]` | `scrollContainer.current` |
| 318:36 | `measureNodes` | `[lockActiveNode, messageRefs, scrollContainer, syncActiveNode]` | `scrollContainer.current`（正文还读 `messageRefs.current`） |
| 440:36 | `scrollToNode` | `[lockActiveNode, onRevealHistory, scrollContainer]` | `scrollContainer.current` |
| 456:41 | `scrollToAssistant` | `[lockActiveNode, onRevealHistory, scrollContainer]` | `scrollContainer.current` |
| 500:39 | `scrollToHeading` | `[lockActiveNode, onRevealHistory, scrollContainer]` | `scrollContainer.current` |

消费方：`:405`、`:438` 两个 effect 把 `measureNodes` / `updateScroll` 当依赖。

## SessionSidebar.tsx（2 条）

| 位置 | 类 | 诊断要点 |
|---|---|---|
| 1195:44 `handleRemoveWorktree` | C | deps `[worktreeState, wtBusy, currentWorktreePath]` |
| 1223:30 （deps 位）`currentWorktreePath` | B | `This dependency may be modified later` |

`currentWorktreePath` 定义在 `:1096`（`currentWorktree?.path ?? null`），`currentWorktree`
由 `worktreeState.worktrees.find(...)` 现算（`:1091-1096`）。

## 三类成因与插件实现锚点

`eslint-plugin-react-hooks@7.1.1` 的 `PreserveManualMemo` 校验（development bundle）：

| 类 | 触发点 | 行号 |
|---|---|---|
| A `RefAccessDifference` | `getCompareDependencyResultDescription` / `compareDeps` | :45505、:45532 |
| B `This dependency may be modified later` | `StartMemoize` 分支 | :45770 |
| C `was memoized in source but not in compilation output` | `FinishMemoize` 分支 | :45800 |
