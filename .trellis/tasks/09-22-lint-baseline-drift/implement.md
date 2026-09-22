# 实施计划

## 前置：确认工作树与分支

1. 确认工作区里只有本任务允许的改动；3 个 `.pi/agents/*.md` 的既有改动由用户明确要求
   **保持原样、不纳入本任务提交**。
2. 分支基线待用户在最终摘要中确认（用户初选 `main`；仓库既有 PR #1/#2 实际合入 `personal`）。
3. `task.py start` 之后才动产品代码。

## Step 0 — 冻结基线（只记录，不改代码）

- [ ] 7.1.1 夹具指向基线 commit，跑 `node_modules/.bin/eslint . -f json`，
      把文件数 / error / 分布写入 `research/fix-before-after.md`。
- [ ] 7.0.1 夹具跑同样命令，确认 0 条。
- [ ] 确认两个夹具的 `node_modules` 均来自干净安装（npm 夹具 `npm ci`；
      pnpm 夹具 `CI=true npx --yes pnpm@10 install --frozen-lockfile`）。

## Step 1 — 类 B：ChatInput 的斜杠命令派生值（先做，预期消掉 4 条）

- [ ] `ChatInput.tsx:1196-1208`：把 `filteredSlashCommands` 的 IIFE 改成 `useMemo`，
      deps 取实际读取（`slashQuery`、`isStreaming`、`slashCommands`、`t`），逐项核对。
- [ ] `ChatInput.tsx:1210-1216`：把 `buildSlashCommandLayout(...)` 的结果改成 `useMemo`
      （deps：`filteredSlashCommands`、`skillDormancy`）。
- [ ] 复跑 7.1.1 夹具 `eslint .`：预期 1486:7、1489:5、1622:81、1622:93 消失；
      若 `slashActiveIndex`(1622:93) 仍在，按类 B 的 state 变体单独处理。

## Step 2 — 类 A：ChatMinimap 的 5 处

- [ ] `:308`、`:318`、`:440`、`:456`、`:500`：按诊断给出的推断路径改写 deps
      （`scrollContainer` → `scrollContainer.current`；`:318` 视诊断同时处理 `messageRefs`）。
- [ ] 复跑 7.1.1 夹具：确认 5 条消失且无新增。
- [ ] 核对 `:405`、`:438` 两个 effect 的重跑语义是否仍在预期内（挂载、消息长度变化）；
      若回调身份变化导致额外重跑，改用 P3（模块级函数 + ref 作参数）。

## Step 3 — 类 C：ChatInput 940/992 与 SessionSidebar 1195/1223

逐站点按 P3 → P1 → P2 顺序试，每改一处即复跑 7.1.1 夹具：

- [ ] `ChatInput.tsx:940` `processImageFiles`：优先 P3（把读 4 个 ref 的逻辑抽到模块级函数，
      以 ref 为参数）；否则 P1 补 `.current` deps。
- [ ] `ChatInput.tsx:992` `saveImagesToDisk`：同上；它同时被 imperative handle(`:930-938`)
      与 `attachImageFiles`(`:1053`) 消费，身份变化要核对。
- [ ] `SessionSidebar.tsx:1195/1223` `handleRemoveWorktree`：优先 P4（`currentWorktreePath`
      作为参数从 JSX 调用点传入），否则 P2（`useMemo` 固定 `currentWorktree`）。
- [ ] 目标：7.1.1 夹具 `eslint .` 达到 **0 error / 0 warning**。

## Step 4 — 完整验证（两棵树 + 行为）

- [ ] npm 夹具指向本分支：`npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm test` 全部退出 0，
      计数与基线对照（`personal` 树 495 文件 / 1411 例）。
- [ ] pnpm 夹具指向本分支：`npx tsc --noEmit` → `npm run lint` → `npm test` 同样退出 0。
- [ ] `npm run test:e2e`（Playwright，含 minimap 交互）在 npm 夹具通过。
- [ ] 新增针对性脚本（建议 `e2e/slash-keyboard.mjs`，产物落任务 `research/`）：
      斜杠菜单打开、ArrowDown/ArrowUp/ArrowLeft/ArrowRight 高亮移动、Enter 执行、Escape 关闭，
      并覆盖 query 变化后的过滤结果；**修复前先记录一次基线断言输出**，修复后对比。
- [ ] SessionSidebar worktree 删除：尝试用真实临时 git 仓库走一遍创建 → 删除；
      若成本不可接受，明确记录"未覆盖"及原因（禁止推断通过）。

## Step 5 — spec 收口（R5）

- [ ] 改写 `.trellis/spec/frontend/quality-guidelines.md:71-93`：机制（两套 lockfile 钉不同插件版本）、
      识别特征、恢复动作（`npm ci` / pnpm@10 复现命令）、"混合树不是必要条件"这一修正。
- [ ] 修正 `:14`、`:18` 的过时文件数（462 / 474），改为"以同一次运行实测为准 + 获取方式"。
- [ ] `grep -n "462\|474" .trellis/spec/frontend/quality-guidelines.md` 无命中。

## Step 6 — 恢复主 checkout 与收尾

- [ ] 主 checkout `npm ci`（先按 `AGENTS.md` 处理 30141 上的 dev server），复跑 `npm run lint` 记录 0。
- [ ] 把修复前后对照（npm 树 0 / pnpm 树 14 → 0 / 0）写入 `research/fix-before-after.md`。
- [ ] 删除两个夹具 worktree（`git worktree remove`）。
- [ ] 提交前检查：`git diff --stat` 只含三个组件与 spec / 任务证据文件；
      无 lockfile 改动、无新增 `eslint-disable`、无规则级别改动。

## 验证命令速查

```bash
# 7.1.1 oracle（迭代主循环；主 checkout 的混合树就是 7.1.1）
cd /home/xupeng/dev/personal/forked/agegr-pi-web
node_modules/.bin/eslint components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx

# 7.0.1 回归（复制改动到 npm 夹具；夹具是独立文件副本，未提交改动必须 cp 过去）
cp components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx \
   /home/xupeng/dev/personal/forked/pi-web-lintclean-personal/components/
cd /home/xupeng/dev/personal/forked/pi-web-lintclean-personal
node_modules/.bin/eslint . -f json   # 统计文件数 / error / 分布

# 7.1.1 收尾证据（夹具保留 7.1.1 树；同样 cp 改动后跑）
cp /home/xupeng/dev/personal/forked/agegr-pi-web/components/{ChatInput,ChatMinimap,SessionSidebar}.tsx \
   /home/xupeng/dev/personal/forked/pi-web-lintclean-pnpm/components/
cd /home/xupeng/dev/personal/forked/pi-web-lintclean-pnpm && node_modules/.bin/eslint . -f json

# 主 checkout 三件套
node_modules/.bin/tsc --noEmit && npm run lint && npm test
```

## 危险文件与回滚点

| 文件 | 危险点 | 回滚 |
|---|---|---|
| `components/ChatInput.tsx` | 1600+ 行；imperative handle(`:930`)、`handleKeyDown`(`:1489`) 是输入路径核心 | 按 Step 分次提交，单步可 revert；revert 后复跑两棵树 lint |
| `components/ChatMinimap.tsx` | 回调被 effect(`:405`/`:438`) 依赖，身份变化影响重跑频率 | 同上 |
| `components/SessionSidebar.tsx` | worktree 删除涉及 API 调用与当前选择状态 | 同上 |

## 开始前检查

- [ ] 分支基线已由用户确认（`main` vs `personal`）。
- [ ] 用户已明确批准最终规划摘要。
- [ ] `.pi/agents/*.md` 的既有改动保持未提交、不被带入。
