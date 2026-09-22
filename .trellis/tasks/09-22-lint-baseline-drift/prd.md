# 锁一致依赖树下复核并收口全仓 lint 的 14 条既有诊断

## Goal

把「全仓 `npm run lint` 报 14 条既有错误」这件事**归因到底并收口**，收口包含两件事：

1. 判断它是源码缺陷还是依赖树产物，并把判定机制写进 spec，使后续会话不必重复论证；
2. 既然这 14 处会在依赖刷新后真实生效（见 Background 3），把它们修到**两棵受跟踪锁文件
   （`package-lock.json` / `pnpm-lock.yaml`）的树上都 0 error**，且不改变三个组件的行为。

来源：用户 2026-09-22 报告「全仓 `npm run lint` 仍有 14 个既有错误（未改动的
ChatInput/ChatMinimap/SessionSidebar，与 spec 记录的 node_modules 漂移同形）；我没做干净树
`npm ci` 复核，也没顺手改那三个组件」。规划期经用户确认：本任务内含源码修复（`fix_now`）。

## Background

### 1. 驱动变量是「用哪个 lockfile 装」，不是源码，也不是"旧树污染"

两棵**干净安装**的树，同一份源码 `personal@5402a5f`，唯一差异是 lockfile：

| 安装来源 | 隔离 worktree | eslint 文件数 | error | react-hooks 插件 |
|---|---|---|---|---|
| `package-lock.json` + `npm ci` | `pi-web-lintclean-personal` | 495 | **0** | 7.0.1 |
| `pnpm-lock.yaml` + `pnpm install --frozen-lockfile` | `pi-web-lintclean-pnpm` | 495 | **14** | **7.1.1** |

（另有 `main@d11d344` + `npm ci`：433 文件 / 0 error，同样是插件 7.0.1。）

文件覆盖数在 `npm ci` 的 `personal` 树与 pnpm 树之间**完全相同（495）**，规则严重级别均为
`error`，因此"覆盖变多"与"规则被升级成 error"都被排除；唯一变量是插件版本，
而插件版本由 lockfile 决定。

14 条全部为 `react-hooks/preserve-manual-memoization`，两棵树上分布一致（7 / 5 / 2）：

```
components/ChatInput.tsx       940:41  992:40  1445:41  1486:7  1489:5  1622:81  1622:93
components/ChatMinimap.tsx     308:36  318:36  440:36   456:41  500:39
components/SessionSidebar.tsx  1195:44 1223:30
```

现工作 checkout 的 14 条同源：该 checkout 的 `node_modules` 先被 pnpm 写过
（`node_modules/.pnpm/` 759 项、`.modules.yaml` mtime 2026-09-22 13:22），又被 npm 覆盖过
（`node_modules/.ignored/` 27 项、`.package-lock.json`），生效插件是
`.pnpm/eslint-plugin-react-hooks@7.1.1_...`，而 `package-lock.json` 期望的
`eslint-config-next/node_modules/eslint-plugin-react-hooks@7.0.1` 不在现树中。

### 2. 两套 lockfile 都被跟踪，且各有真实消费者

- `package-lock.json`：上游同源；`.github/workflows/ci.yml:25-27` 用 `npm ci` + `npm run lint`
  作为门禁，main 上 CI 当前为绿（`gh run list`：CI success，2026-09-22T06:27Z）。
- `pnpm-lock.yaml`：**不在 upstream main 里**（`git cat-file -e main:pnpm-lock.yaml` 失败），
  是 fork 自有文件（`ba6de37 chore: sync pnpm lockfile for next 16.3.5`，author xupeng），
  由 `.github/workflows/release-personal.yml:59` 的 `pnpm install --frozen-lockfile` 使用；
  该 job 只 build/pack，**不跑 lint**。
- 两者钉的插件版本不同：npm `7.0.1` vs pnpm `7.1.1`（`pnpm-lock.yaml:5731`、`:5824`）。

### 3. 这 14 条是"潜伏的真实缺陷"，不是死配置

`eslint-config-next@16.3.5` 对该插件的依赖范围是 **`^7.0.0`**。npm 树当前解析到 7.0.1 只是
因为 `package-lock.json` 生成时 7.1.1 尚未发布；**任何一次 `package-lock.json` 再生**
（依赖升级、`npm update`、上游同步时的锁刷新）都会解析到 7.1.x，这 14 条就会出现在有门禁的
上游 npm CI 上。因此"幻影"只描述当前这棵树的诊断来源，不代表这三处 memoization 可以不管。

### 4. spec 现有记录的归因需要修正

`.trellis/spec/frontend/quality-guidelines.md:71-93`（"验证基线必须来自与锁文件一致的依赖树"）
记录了 2026-09-18 的同一现象（同 14 条、同三个文件），结论写成"旧树造成的幻影诊断"，
机制描述为"`pnpm install` / `npm install` 先后跑过"。本次实测表明：

- 用 `pnpm-lock.yaml` 做**干净**安装同样复现 14 条 ⇒ 污染不是必要条件；
- 真正的机制是"两套受跟踪 lockfile 钉了不同插件版本"，混合树只是它的一种表现形式；
- 该段引用的数字已过时：**lint 覆盖 462 文件**（现 main 433 / personal 495）、
  **lint 期望约 474 文件**（`:14`、`:18`）。

### 5. 诊断的三类成因（读插件实现得到，不是猜的）

`eslint-plugin-react-hooks@7.1.1` 的 `PreserveManualMemo` 校验（
`node_modules/.pnpm/eslint-plugin-react-hooks@7.1.1_*/node_modules/eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.development.js`）：

| 类 | 触发点 | 诊断文本 | 本任务站点 |
|---|---|---|---|
| A | `compareDeps` 判为 `RefAccessDifference`（`:45505`、`:45532`） | `Differences in ref.current access` | ChatMinimap 308/318/440/456/500 |
| B | 源依赖的作用域在 `StartMemoize` 时尚未冻结（`:45770`） | `This dependency may be modified later` | ChatInput 1486、1622:81、1622:93、SessionSidebar 1223 |
| C | `FinishMemoize` 发现操作数未被 memoize（`:45800`） | `was memoized in source but not in compilation output` | ChatInput 940/992/1445/1489、SessionSidebar 1195 |

已确认的两个具体形态：

- ChatMinimap 的 5 处：`scrollContainer` 是 prop 传入的 `RefObject`，回调体读
  `scrollContainer.current`，而 deps 写的是 ref 对象本身 ⇒ 编译器推断出带路径的
  `scrollContainer.current`，与源 deps 根相同、路径不同。
- ChatInput 的类 B：`displayedSlashCommands` 来自 render 期的
  `buildSlashCommandLayout(filteredSlashCommands, skillDormancy)`（`ChatInput.tsx:1210-1216`），
  而 `filteredSlashCommands` 是每次渲染都重建的 IIFE（`:1196-1208`）⇒ 以它们为 dep 的
  `useCallback`(`:1489`) 其实每次渲染都在重建，现有 memoization 形同虚设。

### 6. 证据位置

- `research/clean-tree-verify.sh` — 可复跑的干净树验证脚本（worktree 建在仓库同级目录，不落 `/tmp`）。
- `research/clean-tree-main.log`、`research/clean-tree-personal.log` — npm 树三件套原始输出。
- `research/clean-tree-pnpm.log` — pnpm 树（7.1.1）复现记录。
- `research/baseline-summary.md` — 基线矩阵与结论。
- `research/main-checkout-drift.txt`、`research/tree-hybrid-evidence.txt` — 现 checkout 的混合树证据。
- `research/diagnostics-7.1.1.json` — 14 条完整诊断（含推断依赖文本）。

## Requirements

### R1 可信基线必须可复跑、可归因

验证基线只取自与锁文件一致的树（隔离 worktree + 干净安装），并同时记录：树对应的 ref/commit、
安装命令、`tsc` / `lint` / `npm test` 退出码、lint 覆盖文件数与 error/warning 计数。
禁止用"数字变小了"或"与上次数字相同"直接判定通过。

### R2 归因必须落到单变量

报告必须列出被排除的变量（文件覆盖数相同、规则严重级别仍为 `error`）与唯一保留变量
（lockfile 决定的插件 7.0.1 vs 7.1.1），并用两棵干净树的实测数据支撑，
而不是笼统说"依赖树不一致"。同时必须修正 spec 中"旧树污染"的旧归因。

### R3 源码修复：两棵树都 0 error，且行为不变

把 14 处修到在插件 7.1.1 与 7.0.1 下都不报错：

- 只允许改 `components/ChatInput.tsx`、`components/ChatMinimap.tsx`、`components/SessionSidebar.tsx`
  及其内部实现；保持对外 props / 导出的行为契约不变。
- **禁止**新增 `eslint-disable`、禁止改规则严重级别、禁止改任何 lockfile、
  禁止为过关而删除 memoization（仓库未启用 React Compiler，删掉 `useCallback`/`useMemo`
  就真的失去 memoization）。
- 每个站点必须确认消费方：memoized 值被用作 effect deps / JSX handler / imperative handle 时，
  改造后回调身份的变化不得引入多余重跑或丢更新。

### R4 工作 checkout 恢复锁一致树

主 checkout 执行 `npm ci` 恢复与 `package-lock.json` 一致的树，复跑 `npm run lint` 确认 0 error。
按 `AGENTS.md` 的 dev server 流程处理 30141 上的 `next dev`（`node_modules` 重建期间不要让它
在半途读依赖），必要时停掉再重启。

### R5 spec 收口

改写 `.trellis/spec/frontend/quality-guidelines.md:71-93`，并修正 `:14`、`:18` 的过时文件数：

- 机制：两套受跟踪 lockfile 钉不同插件版本；混合树是表现形式而非必要条件。
- 识别特征：`node_modules/.pnpm/` 与 `node_modules/.ignored/` 并存、存在
  `node_modules/.package-lock.json`、`package-lock.json` 期望的嵌套插件路径缺失；
  以及"同一源码在两棵树上诊断数不同"这一信号。
- 恢复动作：`npm ci`（npm 树）与复现 7.1.1 的 `CI=true npx --yes pnpm@10 install --frozen-lockfile`。
- 文件数不再写死具体数字，改为"以同一次运行内的实测为准 + 给出获取方式"。

## Acceptance Criteria

- [ ] AC1 两棵干净树的基线（`tsc` / `lint` / `npm test` 退出码与计数）记录在任务 `research/` 下，
      且都包含"用哪条命令装的、覆盖多少文件"。
- [ ] AC2 有单变量归因证据：同 495 文件、同规则级别、唯一差异为插件 7.0.1 vs 7.1.1；
      pnpm 干净树复现 14 条、npm 干净树 0 条的原始输出都在 `research/` 下。
- [ ] AC3 修复后：插件 7.1.1 的 pnpm 树 `eslint .` **0 error / 0 warning**，且插件 7.0.1 的
      npm 树仍 **0 error / 0 warning**（两棵树都要给出命令与输出）。
- [ ] AC4 修复后两棵树的 `tsc --noEmit` 与 `npm test` 均退出 0，计数与修复前基线一致
      （`personal` 树 1411 例、`main` 树 1085 例）。
- [ ] AC5 三个组件的可观察行为有运行证据：现有 `npm run test:e2e`（含 minimap 节点/预览交互）
      通过；新增一个针对性脚本覆盖 ChatInput 斜杠菜单键盘导航（上下左右 + Enter/Escape）在
      修复前后的行为一致；SessionSidebar 的 worktree 删除流程若无覆盖则明确写"未覆盖"并说明原因，
      不得用代码阅读推断成通过。
- [ ] AC6 `quality-guidelines.md` 的验证基线段包含机制、识别特征、恢复动作，且不再出现写死的
      462 / 474 文件数（`grep -n "462\|474" .trellis/spec/frontend/quality-guidelines.md` 无命中）。
- [ ] AC7 `git diff` 不含 lockfile 改动、不含新增 `eslint-disable`、不含规则严重级别改动，
      改动文件集 ⊆ {ChatInput.tsx, ChatMinimap.tsx, SessionSidebar.tsx, 相关 spec/任务证据文件}。
- [ ] AC8 主 checkout 在 `npm ci` 后 `npm run lint` 退出 0，且给出恢复前后的计数对照。

## Out of Scope

- 修改上游 `package-lock.json`（会与上游持续冲突，并把 npm CI 从绿变红）。
- 把 `pnpm-lock.yaml` 的插件钉回 7.0.1 来"对齐两棵树"（属于掩盖，且用户已选择改源码）。
- 放宽 / 关闭 `react-hooks/*` 规则或新增 `eslint-disable` 注释。
- 给 `.github/workflows/release-personal.yml` 增加 lint 门禁、升级 CI 的 Node/pnpm 版本。
- 修复 `pnpm install` 在本机 pnpm 12 上的 `ERR_PNPM_IGNORED_BUILDS`（只作为夹具注意事项记录）。

## Open Questions

无阻塞项。分支基线（用户在任务创建时选 `main`，而 fork 的既有 PR #1/#2 都合入 `personal`）
在最终规划摘要中作为待确认项列出。
