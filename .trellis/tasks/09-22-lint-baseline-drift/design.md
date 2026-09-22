# 设计：让 14 条 `preserve-manual-memoization` 在两棵树上都消失

## 目标与边界

**目标**：`components/ChatInput.tsx`、`components/ChatMinimap.tsx`、`components/SessionSidebar.tsx`
在 `eslint-plugin-react-hooks` 7.0.1 与 7.1.1 下都 0 error / 0 warning，且三个组件对外行为不变。

**边界**：

- 只改这三个组件的实现（以及必要的模块级辅助函数），不改 props 契约、不改导出类型签名、
  不改 API / 数据流、不改 lockfile、不改 eslint 配置。
- 不追求"让 React Compiler 真正接管组件"（仓库未安装 `babel-plugin-react-compiler`），
  只追求"手动 memoization 与编译器推断一致"。

## 为什么必须"匹配编译器推断"，而不是"删掉 memo"

仓库未启用 React Compiler 运行时，`useCallback` / `useMemo` 是**唯一**的 memoization 来源。
三条被排除的路径：

1. 删掉 `useCallback` → 依赖它的 effect 每次渲染重跑（`ChatMinimap.tsx:405`、`:438`）；
2. 加 `eslint-disable` → 违反 spec 既有的"豁免必须行内 + 指名规则 + 紧邻理由"，且用户已排除；
3. 降级规则 → 掩盖真实缺陷，上游 CI 迟早以 error 形式暴露。

因此每处都必须让"源 deps"与"编译器推断"一致。好消息是诊断文本已直接给出推断结果，
**eslint 自身就是每处的 oracle**，修复过程可判定、不需要猜。

## 与既有 spec 的一致性

| spec 约束 | 本设计的处置 |
|---|---|
| `hook-guidelines.md:76-79`「`useMemo` 是低频工具…不要为了微优化加 `useMemo`」 | 本任务新增的 `useMemo` **不是微优化**：`filteredSlashCommands`(ChatInput `:1196`) 与 `buildSlashCommandLayout` 的结果每次渲染都重建，使 `getNextSlashIndex`(`:1445`) / `handleKeyDown`(`:1489`) 的 `useCallback` 完全失效；`useMemo` 是让这条既有 memoization 真正生效的最小手段。理由需写进代码注释或提交信息。 |
| `hook-guidelines.md:90-104`：`exhaustive-deps` 保持开启，disable 必须紧邻且说明原因 | 本任务**不新增任何 disable**；若某站点最终只能靠 disable 才能过关，则该站点必须回到设计评审，而不是直接加注释。 |
| `hook-guidelines.md:100-104`：三条 React Compiler 新规则（`immutability` / `refs` / `set-state-in-effect`）被刻意关闭 | 本任务不得为了让 lint 过而**开启**这些规则；修复手段限定在 deps 与派生值 memo 上。 |
| `quality-guidelines.md:94-108`：数据链路脚本不等于浏览器验证 | minimap / 斜杠菜单 / worktree 删除的行为断言必须真跑浏览器，未覆盖项写"未覆盖"。 |
| `quality-guidelines.md:69-93`：三件套退出码 0 且要给出基线来源 | 见"完整验证矩阵"，两棵树都要给命令与输出。 |

## 三类成因与对应修法

### 类 A — `Differences in ref.current access`（ChatMinimap ×5）

**症状**：`scrollContainer` 是 prop 传入的 `RefObject<HTMLDivElement>`，回调体读
`scrollContainer.current`（`:309`），而 deps 写 `[..., scrollContainer, ...]`；
编译器推断的是带路径的 `scrollContainer.current`（`compareDeps` →
`CompareDependencyResult.RefAccessDifference`）。

**主修法 P1**：把 deps 写成推断出的路径形式。

```ts
// 之前
}, [scrollContainer, syncActiveNode]);
// 之后
}, [scrollContainer.current, syncActiveNode]);
```

`ChatMinimap.tsx:318` 的回调同时读 `messageRefs.current`，同理需要把 `messageRefs` 换成
`messageRefs.current`（以迭代时的诊断为准，可能不止一处）。

**为什么可接受**：`scrollContainer.current` 在元素挂载后不再变化，回调身份只在挂载时更新一次；
`:405` / `:438` 的 effect 依赖它，挂载时重跑一次正是期望行为。

**备选 P3（行为零差异）**：把读 ref 的逻辑抽到模块级函数、以 ref 对象为参数传入，
使组件侧 deps 仍写 ref 对象本身。若 P1 让 effect 重跑次数明显增多（以运行证据判断），改用 P3。

### 类 B — `This dependency may be modified later`（ChatInput 1486/1622、SessionSidebar 1223）

**症状**：依赖是 render 期现算出来的值，编译器在 `StartMemoize` 时看不到它被冻结。

**ChatInput 的成因已确认**：

```ts
// :1196-1208  每次渲染重建（IIFE）
const filteredSlashCommands = (() => { ... return [...commands].filter(...).sort(...); })();
// :1210-1216  每次渲染产生新的 commands / groups 数组
const { commands: displayedSlashCommands, groups: groupedSlashCommands } =
  buildSlashCommandLayout(filteredSlashCommands, skillDormancy);
```

**主修法 P2**：把这两段派生用 `useMemo` 固定，deps 取真实输入
（`slashQuery`、`isStreaming`、`slashCommands`、`t`、`skillDormancy` 等，按实际读取补齐）：

```ts
const filteredSlashCommands = useMemo(() => { ... }, [slashQuery, isStreaming, slashCommands, t]);
const { commands: displayedSlashCommands, groups: groupedSlashCommands } =
  useMemo(() => buildSlashCommandLayout(filteredSlashCommands, skillDormancy),
    [filteredSlashCommands, skillDormancy]);
```

这不只是"迎合编译器"：它同时修掉一个既存低效——`getNextSlashIndex`(`:1445`) 与
`handleKeyDown`(`:1489`) 现在**每次渲染都被重建**，其 memoization 实际无效。

**风险点**：`filteredSlashCommands` 的 deps 漏项会让斜杠菜单在输入变化时显示陈旧结果。
必须用浏览器脚本覆盖"query 变化 → 过滤结果与高亮同步"这条路径。

**SessionSidebar 的 `currentWorktreePath`**（`:1096` `currentWorktree?.path ?? null`，
`currentWorktree` 由 `worktreeState.worktrees.find(...)` 现算）候选修法按优先级：

1. **P2**：把 `currentWorktree` / `currentWorktreePath` 用 `useMemo` 固定；
2. **P4**：把当前路径作为参数传给 `handleRemoveWorktree`（调用点在 JSX 内，手上已有
   `currentWorktreePath`），从 deps 去掉该捕获——语义最直接、不新增依赖；
3. 若 `worktreeState` / `wtBusy` 仍被标记（两者是 state，本应先冻结），说明该站点应走 P4 形式。

### 类 C — `was memoized in source but not in compilation output`

站点：ChatInput 940/992/1445/1489、SessionSidebar 1195。

**症状**：`FinishMemoize` 处发现被 memoize 的值仍依赖未 memoize 的操作数。
这几处回调体内都读了若干 `ref.current`（`attachedImagesRef`、`pendingImageCountRef`、
`pendingImageIdRef`、`pendingInlineImagesRef`、`slashItemRefs` 等），而源 deps 只列了
`[compact]` / `[insertTextAtCursor, cwd]` / `[displayedSlashCommands.length, slashActiveIndex]`。

**候选修法（按行为保守度排序，逐站点用诊断决定）**：

1. **P3（首选，行为零差异）**：把读 ref 的逻辑抽为模块级函数，以 ref 对象为参数调用；
   组件侧的捕获对象仍是 ref 本身，deps 语义与今天完全一致。
2. **P1**：把推断出的 `<ref>.current` 补进 deps。对 `attachedImagesRef.current` 这类
   在处理过程中会变的值，回调身份会随之更新；对事件处理器无害，但**必须逐处确认消费方**
   （尤其 `ChatInput.tsx:930-938` 的 imperative handle）。
3. **P2**：若某站点是"render 期派生值未 memo"导致（1445/1489 已归入类 B），用 `useMemo` 解决。

注意 1445 与 1489 同时出现在类 B 与类 C：预期**类 B 的 `useMemo` 修法会同时消掉这两处的类 C 诊断**。
因此实施顺序是"先类 B、再复跑、最后处理剩余类 C"，避免重复改造。

## 迭代与验证夹具

### 两个常驻 worktree（仓库同级目录，禁止落 `/tmp`）

| 夹具 | 路径 | 依赖树 | 用途 |
|---|---|---|---|
| npm 树（7.0.1） | `forked/pi-web-lintclean-personal` | `npm ci` | 上游 CI 同构基线 |
| pnpm 树（7.1.1） | `forked/pi-web-lintclean-pnpm` | `CI=true npx --yes pnpm@10 install --frozen-lockfile` | 复现 14 条 / 验证修复 |

`pnpm@10` 与本仓库 `release-personal.yml:25` 钉的版本一致。本机 pnpm 12.5.1 会因
`ERR_PNPM_IGNORED_BUILDS`（非 TTY 时还会 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）失败，
不作为夹具命令。

### 快速迭代循环

夹具是**独立的文件副本**，主 checkout 里未提交的改动不会自动出现在夹具中；
而主 checkout 自己的 `node_modules` 恰好是 7.1.1（混合树），可以直接当作 7.1.1 的 oracle。
因此迭代循环是"改主 checkout → 主 checkout 跑 7.1.1 → `cp` 到 7.0.1 夹具做回归"：

```bash
# 1) 7.1.1 oracle（主 checkout 的混合树，插件就是 7.1.1）
cd /home/xupeng/dev/personal/forked/agegr-pi-web
node_modules/.bin/eslint components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx

# 2) 7.0.1 回归（复制改动到 npm 夹具后跑）
cp components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx \
   /home/xupeng/dev/personal/forked/pi-web-lintclean-personal/components/
cd /home/xupeng/dev/personal/forked/pi-web-lintclean-personal
node_modules/.bin/eslint . -f json | node -e '<统计文件数/错误数/分布>'
```

注意：主 checkout 的 7.1.1 树在 Step 6 执行 `npm ci` 后会被恢复成 7.0.1，
所以 7.1.1 的 oracle 反馈**必须在 `npm ci` 之前**用完；`pi-web-lintclean-pnpm` 夹具
始终保留 7.1.1，用于收尾时给出最终的两棵树证据。

### 完整验证矩阵（收尾时）

| 树 | `tsc --noEmit` | `npm run lint` | `npm test` | `npm run test:e2e` |
|---|---|---|---|---|
| npm 夹具（7.0.1） | 要 | 要（0 error） | 要 | 要 |
| pnpm 夹具（7.1.1） | 要 | 要（0 error） | 要 | 可选（lint 为主指标） |

行为证据：现有 `npm run test:e2e`（Playwright，`e2e/run.mjs:326-340` 覆盖 minimap 节点与预览）
＋ 新增的斜杠菜单键盘导航脚本。`SessionSidebar` 的 worktree 删除流程目前**无** e2e 覆盖
（`grep worktree e2e/run.mjs` 无命中），若无法在合理成本内补上，按 spec 要求记"未覆盖"。

## 兼容性与迁移

- 无数据格式、无 API、无 session 文件格式变化，不需要迁移。
- 对用户的可见影响仅限"lint 从 14 条变 0 条"，以及三组件里若干回调身份的更新频率可能变化。
- `package.json` / lockfile 不变 ⇒ 不需要重装依赖，也不改变发布产物。

## 风险与回滚

| 风险 | 触发点 | 缓解 |
|---|---|---|
| 回调身份变化导致 effect 重跑增多或丢更新 | ChatMinimap `:405`/`:438`、ChatInput imperative handle(`:930`)、Sidebar worktree 删除 | 逐站点核对消费方；优先 P3/P4 这类"身份语义不变"的修法；e2e + 定向脚本验证 |
| 斜杠菜单过滤结果变陈旧 | `filteredSlashCommands` 的 `useMemo` deps 漏项 | 键盘导航脚本覆盖 query 变化路径；deps 按实际读取补齐后复跑 |
| 修一处引入另一处诊断 | 类 B/C 在诊断上相互掩盖 | 每改一组就复跑 7.1.1 夹具，只在计数下降且无新增文件时继续 |
| 只在 7.1.1 通过、7.0.1 回归 | 两个版本的校验有差异 | 每轮同时跑两棵树 |

**回滚点**：按类（Step 1/2/3）分次提交，使单组改动可独立 revert；revert 后必须复跑两棵树的
lint，确认回到"npm 0 / pnpm 14"的确知状态。

## 运维

- 主 checkout 的 `npm ci` 会重建 `node_modules`：30141 上的 `next dev` 需按 `AGENTS.md` 的流程
  优雅停掉，必要时把 `.next` 移入 `mktemp -d` 备份后重启；不要用 `--webpack` 兜底。
- 收尾时删除两个夹具 worktree（`git worktree remove`），避免遗留同级目录。
