# 逐站点修复记录（09-22-lint-baseline-drift）

- 起始 commit：`personal@5402a5f`（工作分支 `task/09-22-lint-baseline-drift`）
- 7.1.1 oracle（主 checkout 混合树，`NODE_ENV=production`，生效插件 7.1.1）：
  `cd /home/xupeng/dev/personal/forked/agegr-pi-web && node_modules/.bin/eslint <files|.>`
- 7.0.1 回归夹具：`/home/xupeng/dev/personal/forked/pi-web-lintclean-personal`（`npm ci`）
- 7.1.1 收尾夹具：`/home/xupeng/dev/personal/forked/pi-web-lintclean-pnpm`（pnpm@10 frozen）
- 说明：调试期间临时给 oracle 的插件 bundle 加过日志，收尾已从备份还原，`grep -c "rlh"` 为 0。

## 基线（未改动）

| 树 | 插件 | 文件 | error | warning | 分布 |
|---|---|---|---|---|---|
| 主 checkout 三文件 | 7.1.1 | — | 14 | 0 | ChatInput 7 / ChatMinimap 5 / SessionSidebar 2 |
| pnpm 夹具全仓 | 7.1.1 | 495 | 14 | 0 | 同上 |
| npm 夹具全仓 | 7.0.1 | 495 | 0 | 0 | — |

## 最终结果

| 树 | 插件 | 文件 | error | warning | eslint 退出码 | tsc --noEmit |
|---|---|---|---|---|---|---|
| 主 checkout 全仓 | 7.1.1 | 495 | **0** | **0** | 0 | 0 |
| pnpm 夹具全仓 | 7.1.1 | 495 | **0** | **0** | 0 | 0 |
| npm 夹具全仓 | 7.0.1 | 495 | **0** | **0** | 0 | 0 |

定向测试（10 个组件测试文件，`node --test`）：**72 pass / 0 fail**。

无新增诊断文件、无新增规则（两棵树均为 0 problem）。改动文件 ⊆ 三个组件；无新增
`eslint-disable`、无 lockfile / package.json 改动、无规则级别改动。

---

## Step 1 — 类 B：ChatInput 斜杠命令派生值（14 → 9，0 warning）

诊断原文（`eslint 7.1.1`）：

- `1486:7` `displayedSlashCommands.length` → `This dependency may be modified later`
- `1622:81` `displayedSlashCommands` → `This dependency may be modified later`
- `1622:93` `slashActiveIndex` → `This dependency may be modified later`
- 同源类 C：`1445:41 getNextSlashIndex`、`1489:5 handleKeyDown` → `Could not preserve existing memoization`

改动：

1. `filteredSlashCommands` 的渲染期 IIFE → `useMemo(..., [slashQuery, isStreaming, slashCommands, t])`。
   deps 按函数体实际读取逐项核对（`BUILTIN_SLASH_COMMANDS`、`getSlashDescription`、
   `slashMatchRank`、`SLASH_SOURCE_ORDER`、`TEXT_COLLATOR` 都是模块级常量/函数，不入 deps）。
2. `buildSlashCommandLayout(filteredSlashCommands, skillDormancy)` 的结果 →
   `useMemo(() => ..., [filteredSlashCommands, skillDormancy])`。
3. 上述改动触发 `exhaustive-deps` warning：`skillDormancy` 的 `: {}` 兜底每次渲染新建对象。
   把 `skillDormancy` 也改成 `useMemo(() => (cwd && skillDormancyState?.cwd === cwd
   ? skillDormancyState.values : {}), [cwd, skillDormancyState])`，warning 消失。

理由（按 spec 要求写进代码注释）：这里加 `useMemo` 不是微优化，而是让既有的
`getNextSlashIndex`/`handleKeyDown` `useCallback` 真正生效——此前它们依赖的派生数组每次渲染
都重建，memoization 形同虚设。

结果：`1486`、`1622:81`、`1622:93`（类 B）与 `1445`、`1489`（类 C）全部消失；改动后 7.1.1 三文件
9 error / 0 warning，全仓 495 文件 9 error / 0 warning。

消费方核对：`filteredSlashCommands` 只用于 `buildSlashCommandLayout` 与 `slashCommandCountLabel`；
`displayedSlashCommands`/`groupedSlashCommands` 用于 `getNextSlashIndex`、`handleKeyDown`、JSX 渲染。
deps 用 `===` 比较（含 `slashQuery` 字符串、`isStreaming` 布尔），输入变化必定重算，无陈旧结果风险。

采用模式：**P2（useMemo 固定 render 期派生值）**。

## Step 2 — 类 A：ChatMinimap 5 处（9 → 4，0 warning）

诊断原文（5 处同型）：

- `308:36 updateScroll`、`318:36 measureNodes`、`440:36 scrollToNode`、`456:41 scrollToAssistant`、
  `500:39 scrollToHeading` → `The inferred dependency was 'scrollContainer.current', but the source
  dependencies were [... scrollContainer ...]. Differences in ref.current access.`

试过的方案与结果：

- **P1（先把 deps 改成 `scrollContainer.current`）**：类 A 5 条消失，但 `exhaustive-deps` 立刻报 5 条
  warning（`Mutable values like 'scrollContainer.current' aren't valid dependencies`）。因为仓库
  `exhaustive-deps` 保持开启，P1 无法同时满足两条规则 → 放弃。
- **P3（最终采用）**：新增模块级 helper `readRefCurrent<T>(ref): T | null => ref.current`，
  5 处 `const scrollEl = scrollContainer.current;` 改为 `readRefCurrent(scrollContainer)`，
  deps 保持 `scrollContainer`（ref 对象）不变。

结果：类 A 5 条全消，且无 warning。全仓 495 文件 4 error / 0 warning。

消费方核对：回调身份语义**与改动前完全一致**（deps 仍是 ref 对象，未改变重跑频率）。
`:405` effect 依赖 `updateScroll`、`:438` effect 依赖 `measureNodes`/`updateScroll`——只有
`messages.length` 或其余真实 dep 变化时才重跑，与修复前相同；`.current` 读取结果不变。

采用模式：**P3（模块级函数 + ref 作参数，行为零差异）**。

## Step 3 — 类 C：ChatInput 941/993 与 SessionSidebar 1195/1223（4 → 0）

### 3a. ChatInput 941 `processImageFiles` / 993 `saveImagesToDisk`

诊断原文：

- `941:41` / `993:40` → `This value was memoized in source but not in compilation output`

排查过程（用临时插桩读插件 `PreserveManualMemo` 的 `isUnmemoized`）发现：

- 这两条与回调**函数体内容无关**：把 `processImageFiles` 函数体替换成 `void files` 仍然报错。
- 生产 bundle 日志显示，这两处 `FinishMemoize` 的 `decl` 是一个**未命名临时值**，其 scope 从未被
  `PreserveManualMemo` 访问（`inScopes=false`），所以 `isUnmemoized` 命中；其余 20+ 个
  `useCallback` 的 `decl` 都是命名临时值且 `inScopes=true`。
- 触发组合：`useImperativeHandle(ref, () => ({ ... }))`（**无 deps 数组**）在
  `processImageFiles`/`saveImagesToDisk` **声明之前**前向引用了它们；只要之后再有任何一处引用
  （`attachImageFiles` 的 body/deps、`handlePaste`、甚至 `xxxRef.current = xxx` 赋值），编译器就
  无法保留这两个 callback 的手动 memoization。移除前向引用或移除其余引用任一，诊断即消失。

改动（**根因修法，非绕过**）：把 `processImageFiles`、`saveImagesToDisk` 两段定义整体上移到
`useImperativeHandle` 之前（紧跟 `insertTextAtCursor` 之后）。两处 `useCallback` 的 deps
（`[compact]`、`[insertTextAtCursor, cwd]`）与函数体**逐字未改**；只是消除了前向引用。
代码里加了注释说明"为何必须保持在 `useImperativeHandle` 之上"，防止后续重构移回。

结果：ChatInput 941/993 消失，全仓降到 2 error / 0 warning。

消费方核对：

- imperative handle：仍以闭包捕获这两个 callback；声明顺序前移不改变闭包内容。变化仅是本组件内
  两个 `useCallback` hook 的调用顺序前移，对 React 而言顺序在每次渲染中稳定，对外部 props/API/
  数据流无影响。`attachImages`/`saveImages`/`addImages` 行为不变。
- `attachImageFiles`（deps 仍含二者）与 `handlePaste`（deps 仍含 `processImageFiles`）：callback
  身份更新条件不变（`compact` / `cwd` 变化时），无多发/丢更新。
- 未改变任何回调身份的更新频率语义。

采用模式：**P3 的落点不同——不是抽 ref 逻辑，而是消除 `useImperativeHandle` 的前向引用**
（函数体抽 ref 逻辑经实测无效：body 置空仍报错）。

### 3b. SessionSidebar 1195/1223 `handleRemoveWorktree`

诊断原文：

- `1195:44` → `This value was memoized in source but not in compilation output`
- `1223:30` `currentWorktreePath` → `This dependency may be modified later`

原计划 P4（把 `currentWorktreePath` 作为参数从 JSX 调用点传入）：lint 能过，但
`components/SessionSidebar.worktree.test.mjs` 用源码断言锁死了
`if (currentWorktreePath === path) setSelectedCwd(worktreeState.projectRoot)`，P4 会让该测试失败；
在"只允许改三个组件文件、不改测试"的约束下放弃 P4。

最终改动（P2）：把 `currentWorktree` 与 `currentWorktreePath` 用 `useMemo` 固定：
`currentWorktree` deps `[worktreeState, selectedCwd]`，`currentWorktreePath` deps `[currentWorktree]`。
`handleRemoveWorktree` 的签名、函数体、deps（`[worktreeState, wtBusy, currentWorktreePath]`）**保持原样**。

结果：1195/1223 消失，全仓 0 error / 0 warning。

消费方核对：

- worktree 删除两个调用点（`:1800` 强制删除、`:1857` 普通删除）签名不变，行为不变。
- `currentWorktreePath` 原本是 `string | null` 原始值，deps 比较本就按值；memoize 后返回相同字符串，
  `handleRemoveWorktree` 的身份更新时机与修复前一致（`worktreeState`/`wtBusy`/值变化时）。
- `currentWorktree` 只被 JSX 读取属性；memoize 后同一 `worktreeState`/`selectedCwd` 下返回同一对象，
  无可见行为差异。

采用模式：**P2（useMemo 固定 render 期派生值；P4 因既有源码断言测试被否）**。

---

## 改动清单

| 文件 | 改动 |
|---|---|
| `components/ChatInput.tsx` | `skillDormancy` useMemo；`filteredSlashCommands` + `buildSlashCommandLayout` useMemo；`processImageFiles`/`saveImagesToDisk` 上移到 `useImperativeHandle` 之前（消除前向引用） |
| `components/ChatMinimap.tsx` | 新增模块级 `readRefCurrent`；5 处回调改用它读 `scrollContainer.current`，deps 不变 |
| `components/SessionSidebar.tsx` | `currentWorktree`/`currentWorktreePath` useMemo |

- 无 `eslint-disable`、无 lockfile / package.json 改动、无规则级别改动。
- `.pi/agents/*.md` 与 `.trellis/spec/frontend/quality-guidelines.md` 的改动非本次 implement 产生，
  保持原样未动。
