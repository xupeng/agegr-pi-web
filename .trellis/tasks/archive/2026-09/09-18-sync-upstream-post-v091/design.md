# 设计：同步上游 v0.9.1 之后的 9 个提交并发布 0.9.4

证据来源：[research/merge-forecast.md](./research/merge-forecast.md)（只读预演，所有 SHA 与
命令输出均为本次实测）。决策来源：用户在 2026-09-18 的五项选择
（D1 吸收 09-09 / D2 主 checkout 直接 merge / D3 合并后 bump+发布 / D4 npm 安装并同步两个锁 /
D5 tsc + lint + 全量单测）。

## 1. 总体形状

```
阶段 A 合并与验证（不可逆发布之前）        阶段 B 发布 0.9.4（独立目录、可单独中止）
─────────────────────────────────         ────────────────────────────────────────
备份 ref  →  基线验证  →  merge         冻结 commit H
             ↓                            → 导出 H 到隔离 release root
            人工解 ChatWindow 冲突         → 私有 npm ci
            9 项功能语义核对                → 隔离 TURBOPACK= npm run build
            tsc / lint / 全量单测           → 同一 tgz 审计 + 生产安装 smoke
            提交 merge + 跟进提交           → publish dry-run
                                            → 【用户 2FA】真实 publish latest
                                            → 远端核验 → 本地 bump commit
```

阶段 A 结束点是一个**可发布冻结提交 H**；阶段 B 只消费 H，不再改业务代码。
阶段 B 失败（构建/审计/smoke）一律回到阶段 A 重新冻结，绝不在发布的 tgz 上"就地修"。

## 2. 合并设计

### 2.1 方式

在主 checkout `personal` 分支上执行普通 merge（`git merge upstream/main`）。
拓扑上 9 个提交线性推进，personal 无同名提交，无需 rebase/cherry-pick；
普通 merge 保留上游历史，便于日后 `git log origin/personal..upstream/main` 继续做增量核对。
不加 `--no-ff`（本就无法 fast-forward），不重写历史。

合并会记录 merge 提交；personal 自有的 67 个领先提交与其上游基线保持不变。

### 2.2 前置隔离（用户未提交文件的保护）

用户工作区当前有 3 个未提交的 `.pi/agents/trellis-{check,implement,research}.md` 与未跟踪的
`.trellis/tasks/09-13-npm-patch-release/`。9 个上游提交**不触碰**这些路径，
因此 merge 允许在脏工作区执行，且不会覆盖它们。

设计约束：

- merge 前记录这三个文件的 SHA256，merge/验证/提交后逐字比对，任何变化即判失败。
- 提交阶段只 `git add` 明确列出的路径，**禁止** `git add -A` / `git add .`。
- 不使用 `git stash` / `git checkout --` / `git clean`（会动用户文件）。

### 2.3 `ChatWindow.tsx` 冲突解决

唯一冲突。解析目标 = **上游的新视觉/布局 + personal 的 ask_user 列内结构**：

| 维度 | 取值 | 理由 |
|------|------|------|
| 品牌区在 JSX 中的位置 | personal 的位置（`{isEmptyNew && (...)}` 在 `{askUserCardInColumn}` 之前、`relative shrink-0` 包装层之外） | personal 为此特意重排过，ask_user 卡片要求"header 与 composer 之间"；spec `frontend/ask-user-protocol.md` 明确空会话卡片保持 `padding: 0 16px 12px` 列对齐 |
| 外层容器 | 上游：`className="mb-3 w-full"` + `paddingLeft: 16, paddingRight: isMobile ? 16 : 52` | 与 personal 的 `askUserCardInColumn` 及 ChatInput 完全同 padding，列对齐更强 |
| 内层 flex 行 | 上游：`maxWidth: "var(--chat-content-max-width, 820px)", margin: "0 auto"` | 上游把居中从外层移到内层，避免与 personal 外层 `mx-auto` 语义重复 |
| `alignItems` | 上游 `"center"`（personal 旧值为 `"baseline"`） | 图标（32×32）替代文字 π 后 baseline 对齐不再适用 |
| logo | 上游 `<Image src="/icons/apple-touch-icon.png" width={32} height={32} alt="" priority />` | 静态资源已存在于 `public/icons/`；`priority` 只影响预加载提示 |
| `chatInputElement` + `ExtensionStatusBar` | 保持 personal 结构（`<div className="relative shrink-0">`） | 上游该行未变，personal 的 Trellis/扩展状态栏依赖此包装 |
| `{askUserCardInColumn}` | 保留在品牌区之后、`relative shrink-0` 之前 | personal 的列内卡片语义，spec 已固化 |

即：把上游 `=======` 之后的内容照搬进 personal 的位置，仅保留 personal 的品牌区外置结构。
不接受"只取上游、丢弃 ask_user 结构"，也不接受"只保留 personal、放弃品牌区新布局"。

### 2.4 自动合并文件的语义复核清单

文本无冲突 ≠ 语义正确。以下文件各有双方改动，必须逐项核对：

| 文件 | personal 侧 | 上游侧 | 期望结果 |
|------|-------------|--------|----------|
| `app/globals.css` | `--chat-font-size-offset` 体系（消息正文/代码块/表格） | `.extension-widget-content` 改用同一 offset | 三处 `calc(... + var(--chat-font-size-offset, 0px))` 同时存在；扩展 widget 字号随聊天字号变化 |
| `lib/worktree.ts` | `PROJECT_CACHE_TTL_MS` 10 分钟 + `clearCachedProjectsOnDisk()` | `git(..., timeoutMs)` 可配置、`addWorktree` 5 分钟超时、新分支优先远端 tip | 两套改动共存；`invalidateProjectCache()` 仍清磁盘缓存；worktree add 用 5 分钟超时 |
| `components/ChatWindow.tsx` | 除冲突块外的其它 personal hunk | 扩展对话框标题换行、扩展下拉 `scroll-margin` | personal hunk 未丢失；两处扩展修复存在 |
| `AGENTS.md` | personal 的架构/设计章节 | UNC 路径说明 + auth 限流说明 | 上游新增段落存在，personal 章节不被删 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | personal 自有文案 | `settings.*`/登录限流文案 | 三语文件各自含新 key，键名一致 |
| `package.json` | fork 包名/版本/发布脚本/额外依赖 | `next`、`eslint-config-next` 升 16.3.5 | 上游版本号生效，personal 依赖与脚本不丢 |
| `package-lock.json` | fork 根 name/version、`peer` 标记 | next 16.3.5 + sharp 0.35.4 相关条目 | 根 name/version 为 personal，next 相关条目为 16.3.5 |
| `next.config.ts` | 无改动 | `images: { unoptimized: true }` | 直接采用 |

### 2.5 依赖与锁文件

采用 D4 = npm 安装并同步两个锁。pnpm 锁并非装饰品：
`.github/workflows/release-personal.yml`（pnpm 10 + `--frozen-lockfile`）用它构建 GitHub
Release 产物，所以必须与 `package.json` 一致，否则该流水线会失败。

1. `npm install`（在 `next` 已升 16.3.5 的 `package.json` 上执行）→ 更新 `package-lock.json`，
   安装 `node_modules`。预期 `node_modules/next` = 16.3.5。
2. `pnpm install --lockfile-only --config.resolutionMode=time-based` → 只同步
   `pnpm-lock.yaml` 的 next 家族条目，不碰 `node_modules`。
   **必须带 `--config.resolutionMode=time-based`**：实测（见 research 5.1）默认解析与
   `pnpm update` 都会把 `@typescript-eslint/*`、`zod`、`@napi-rs/wasm-runtime` 等
   **无关依赖**一并升版，构成范围外漂移；time-based 下唯一变化是 next 家族 + 根 importer。
3. 断言：`npm ls next` 无 unmet/peer 错误；`pnpm-lock.yaml` 中不再出现 `next@16.3.1`；
   两锁的根 `name`/`version` 仍为 `@xup3ng/pi-web` / 0.9.2（bump 留到阶段 B）。

不做：依赖大版本漂移、`npm update`、用 pnpm 重装 `node_modules`（避免 npm/pnpm 混合安装
破坏当前可用的 `node_modules`）、改 `package.json` 的 engines。

### 2.6 验证设计（D5 = tsc + lint + 全量单测）

先基线后合并，同一环境同一命令，逐条对照：

| 步骤 | 命令 | 判据 |
|------|------|------|
| 基线 | `node_modules/.bin/tsc --noEmit` / `npm run lint` / `npm test` | 记录退出码、lint 诊断条数与逐条内容、单测通过/失败计数 |
| 候选 | 同上（依赖已升 16.3.5） | 退出码 0；lint 诊断不得新增（历史 14 条 `react-hooks/preserve-manual-memoization` 若仍在需逐条比对，不因数量相同就放过）；单测全绿 |
| 专项 | `node --test lib/auth-throttle.test.mjs lib/file-paths.test.mjs lib/paths.test.mjs app/api/web-auth/route.test.mjs components/ChatWindow.extension-request.test.mjs` | 上游新增/修改的 5 个测试全绿 |

约定（沿用本仓库既有事实，不从历史任务继承"通过"结论）：

- `npm test` 需要 Node 26（本机 v26.1.0）与构建期 `tsc` 无关；不用 `next build` 验证。
- 开发期禁止 `next build`（AGENTS.md）；构建只发生在阶段 B 的隔离目录。
- 不新增/放宽断言来"换取绿色"；出现新失败即停，回到 2.4/2.3 复核。

### 2.7 提交与基线冻结

阶段 A 的提交批次（顺序固定）：

1. `merge: integrate upstream v0.9.1..860698a`（merge 提交，含冲突解决结果）
2. 若冲突解决之外还有必需跟进（例如锁文件安装后的额外修正）：`chore: sync lockfiles for next 16.3.5`
3. 任务记录（本任务目录 + 归档 09-09 的目录移动）：`chore(task): record post-v0.9.1 upstream sync`
   —— 按 workflow 3.4，任务记录提交排在业务提交之后。

冻结点 `H` = 上述提交完成后的 `HEAD`（工作区干净）。阶段 B 全部操作以 `H` 导出的源码为唯一输入。

### 2.8 备份与回滚

| 触发 | 动作 |
|------|------|
| merge 前 | 记录 `391c1412...` 为回退锚点；`git tag pre-upstream-860698a-<ts>`（本地 tag，不推送） |
| merge 冲突比预期多 | `git merge --abort`，回到干净 `personal`，重新规划 |
| 冲突解错/验证失败 | `git reset --hard 391c1412...`（仅在已确认用户文件 hash 未变时）+ 删本地 tag |
| 阶段 A 已提交、阶段 B 构建失败 | 阶段 B 目录整体废弃重建；`H` 本身不动，业务回滚另议 |
| 阶段 B 已 publish 后发现问题 | **不可回滚**：同版本不可重发。只能在核验报告中如实记录，后续以新补丁版本修复（需重新授权） |

## 3. 发布设计（0.9.4）

### 3.1 版本语义

- registry latest 已是 `0.9.3`，本地 `package.json` 仍是 `0.9.2`（09-13 明确未提交 bump）。
- 本次目标：`@xup3ng/pi-web@0.9.4`，public/latest。
- 因此本地 git 会**跨过 0.9.3**。为让历史可追溯，阶段 B 的 bump 提交信息与 `prd.md`
  都显式记录"0.9.3 已发布但未进入本地 git 历史"。是否先补一个 0.9.3 的本地版本提交，
  属于需要用户确认的开放项（见 prd 待确认项 V1）。

### 3.2 隔离环境

新建 `../.pi-web-v094-release-<YYYYMMDD-HHMMSS>/`，**不复用** 09-13 的 release root state：

```
<root>/
  src/            # 从冻结提交 H 导出的源码（git archive / worktree，不含 .git）
  home/ xdg-*/    # 隔离 HOME / XDG
  agent/          # PI_CODING_AGENT_DIR
  npm-cache/      # 私有 npm cache
  npmrc           # 私有 userconfig，registry 锁定 npmjs
  check/          # check-run.py 的 log/json
  artifacts/      # 唯一 tgz + hash
  install/        # 生产安装 smoke 前缀
  fixture/        # 独立 git fixture 项目（非 linked worktree）
  logs/ evidence/
```

可复用 09-13 的 `env.sh` / `check-run.py` 模式（`python3 check-run.py <name> <cwd> <cmd...>`
记录退出码与元数据），但必须重新创建目录与私有 cache，且**不读取任何真实凭据**。

关键隔离要求：

- 不继承 provider/npm/Git/代理凭据；`NPM_CONFIG_USERCONFIG` 指向私有空 npmrc，
  registry 显式 `https://registry.npmjs.org/`。
- 不接触主 checkout 的 `.next`、`node_modules`、`~/.pi/agent` 真实数据与会话文件。
- smoke 用独立 fixture git 项目与动态端口，不复用 09-13 的端口/目录。

### 3.3 发布流水线（每步一条命令、退出码落 `check/*.json`）

1. 导出：`git archive H | tar -x -C src/`（或 `git worktree add --detach`）；记录 H 的 SHA 与
   `src/` 树 hash。
2. 安装：私有 `npm ci --cache npm-cache`；失败即停（不改锁、不重生成）。
3. 构建：**仅隔离目录** `TURBOPACK= npm run build`（`--webpack`，与 `package.json` 一致）。
   主 checkout 绝不 build。
4. 打包审计：`npm pack` 生成唯一 tgz；记录 SHA256/SHA512；检查内容（`files` 允许列表、
   无 `.git`/`.pi`/`.trellis`/`.env`/`.npmrc`/凭据/真实会话与附件/主目录绝对路径、
   无越界 symlink）。异常一律重建重审，不就地编辑 tgz。
5. 生产安装 smoke：从同一 tgz 安装到隔离前缀，跑 CLI + 页面静态资源 + fixture API +
   Trellis/终端基础冒烟，动态端口，结束清理进程组与端口。
6. `npm publish --dry-run`（显式 `--registry` / `--tag=latest` / `--access=public`）→ 退出码 0。
7. **门：用户重新登录 npm 并确认真实发布**（当前 `npm whoami` 401；2FA 需浏览器）。
   未获确认前不 publish。
8. 真实 `npm publish`（同一冻结 tgz 语义：源码未变、hash 未变）。
9. 有界核验：轮询（≤10 分钟）`npm view @xup3ng/pi-web@0.9.4 ... --json` 与 `dist-tags`；
   下载远端 tarball，比对 SHA512 SRI 与本地已审计值一致；latest = 0.9.4。
   超时/不一致 → 记录"已上传但核验待定"，**不重发**。
10. 本地 bump 提交：`package.json` + `package-lock.json`（+ `pnpm-lock.yaml` 若随之变化），
    提交信息 `chore: release 0.9.4`。此提交只在核验成功后执行。

### 3.4 发布门禁清单（任一不满足即停）

- [ ] 阶段 A 冻结提交 `H` 已提交、工作区干净、用户文件 hash 未变
- [ ] tsc / lint / 全量单测在 `H`（含 next 16.3.5 依赖）通过
- [ ] 隔离 `npm ci` 退出 0，锁未漂移
- [ ] 隔离 build 退出 0
- [ ] tgz 审计通过且 hash 记录完整
- [ ] 生产安装 smoke 通过
- [ ] publish dry-run 退出 0
- [ ] 用户明确批准真实 publish，且 npm 已登录（`whoami` = `xup3ng`）

### 3.5 明确不做

- 不 push（`origin/personal` 推送另行授权）；不创建 GitHub Release；`release-personal.sh`
  不参与（它会 push 分支和 tag）；`npm run release` 与本设计的隔离要求冲突，禁用；
  `scripts/release-npm.sh` 在主 checkout build + 要求整树干净，**不原样运行**（可参考其清单）。
- 不改 `scripts/**` 与 `next.config.ts` 的构建语义。
- 不发布 0.9.3 的替代/重发（registry 同版本不可重发）。

## 4. 风险与取舍

| 风险 | 影响 | 处理 |
|------|------|------|
| `ChatWindow.tsx` 解错导致 ask_user 卡片位置/对齐回归 | 中 | 冲突块按 2.3 表逐项核对；spec `ask-user-protocol.md` 的"UI 布局"小节作为判据 |
| 脏工作区上 merge 误伤用户文件 | 高 | 前后 SHA256 比对 + 只 `git add` 明确路径 + 禁用 stash/clean |
| next 16.3.5 与个人扩展/`node-pty` 等原生依赖不兼容 | 中 | 合并后立即 `tsc` + 全量单测；构建问题在阶段 B 暴露，失败即停不回滚业务 |
| 双锁文件（npm + pnpm）不同步 | 中 | 两锁都同步并断言 next 版本一致 |
| 发布不可逆 | 高 | 冻结 `H` + 唯一 tgz + hash 链 + 单独的用户批准门；不重发 |
| npm 会话 401 / 2FA 未就绪 | 高（阻塞） | 列为门禁项，发布前必须由用户处理 |
| lint 历史 14 条诊断与新增诊断混淆 | 低 | 逐条记录对照，不只看数量 |
| 主 checkout 因合并触发运行中服务/HMR 变化 | 低-中 | 当前 30141 无监听；合并本身不重启任何服务，如用户有其他实例运行则只影响其源码目录 |

## 5. 与既有任务/文档的关系

- 归档 `09-09-sync-upstream-release`：其目标（合上游 + 发 0.9.2）已由 09-12/09-13 完成，
  剩余"同步并发布"范围由本任务承接（D1）。
- `09-13-npm-patch-release` 保持其自身状态不变：它的 0.9.3 已发布、本地未提交，
  本任务不代它提交，只在 `prd.md` 记录版本线现状。
- spec 偏差：`.trellis/spec/frontend/settings-dialog-mobile.md` 的"对话区字号"小节仍描述
  旧的 `lib/chat-font-preference.ts` 整数 offset 方案，而当前实现已是
  `hooks/useChatAppearance.ts` + `--chat-font-size-offset`。属于本任务 Phase 3.3 的候选更新项。
