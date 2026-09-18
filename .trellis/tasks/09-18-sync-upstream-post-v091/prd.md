# 同步上游 v0.9.1 之后的 9 个提交

> **状态（2026-09-18）**：规划中（planning）。已确认事实与只读合并预演完成；
> 五项决策已由用户确认；技术设计与执行手册已落盘（`design.md` / `implement.md`）。
> 尚未 `task.py start`、尚未 merge、尚未安装依赖、尚未发布。文末"已确认决策与最终要求"
> 是最新一轮，上面标注为"历史草案"的段落仅作过程记录，不能覆盖它。

## 已确认决策（2026-09-18，用户选择）

| 编号 | 决策 | 取值 |
|------|------|------|
| D1 | 任务归属 | **吸收 09-09**：归档 `09-09-sync-upstream-release`，其"同步并发布"剩余范围由本任务承接 |
| D2 | 合并方式 | **主 checkout 直接 merge**（在 `personal` 分支上 `git merge upstream/main`） |
| D3 | 版本发布 | **合并后 bump + 发布**：目标 `@xup3ng/pi-web@0.9.4`，public/latest |
| D4 | 依赖与锁 | **`npm install` + 两个锁文件同步**（`package-lock.json` + `pnpm-lock.yaml`） |
| D5 | 验证深度 | **tsc + lint + 全量 node 单测**（不跑 `e2e/run.mjs`，不做浏览器手工 smoke） |
| D6 | 锁文件范围口径 | **按上游原样接受**（2026-09-18 复核后确认）：AC4 的"只涉及 next 家族"按 AC4 补注执行，不手工剔除 npm 锁里上游 `e5a2434` 自带的 audit-fix 条目，避免与上游锁分叉（阶段 B 的 `npm ci` 与后续再合上游都依赖上游原样） |

## 要求

- **R1 合并拓扑**：`upstream/main`（`860698a...`）成为 `personal` 的祖先，无未解决冲突；
  9 个提交的每项改动都能在合并结果中定位；personal 的 67 个领先提交与全部定制不回归。
- **R2 冲突解决**：唯一冲突 `components/ChatWindow.tsx` 必须解成"上游品牌区新内容 +
  personal 的列内 ask_user 卡片结构"，按 `design.md` §2.3 表格逐项落；自动合并的 8 个文件
  按 §2.4 表逐项做语义复核，不接受"无文本冲突即通过"。
- **R3 用户未提交文件保护**：`.pi/agents/trellis-{check,implement,research}.md` 前后 SHA256
  必须一致；不 `stash` / `clean` / `checkout --`；提交时只 `git add` 明确路径。
- **R4 依赖与锁自洽**：`next` / `eslint-config-next` 升到 16.3.5，`node_modules` 实际安装版本
  一致；两个锁文件都同步，且只含 next 家族变化（pnpm 侧用 time-based 解析避免无关漂移）。
- **R5 验证**：合并前后各跑一次 tsc / lint / 全量单测，lint 诊断**逐条**对照；
  不继承历史"通过"结论，不为换绿放宽断言。
- **R6 发布（0.9.4）**：只在隔离 release root 中从冻结提交 `H` 导出源码构建；
  同一 tgz 完成审计 + 生产安装 smoke + publish dry-run 后才真实发布；
  真实 publish 需用户单独批准（当前 `npm whoami` = 401，需用户重新登录并完成 2FA）。
- **R7 不可逆操作边界**：真实 publish 不可回滚、同版本不可重发；失败或核验歧义一律如实记录、
  不重发、不改 latest；本地 bump 提交只在远端核验成功后执行。
- **R8 流程边界**：不 push、不打 tag、不建 GitHub Release、不在主 checkout `next build`、
  不改 `scripts/**`、不动 09-13 的状态与其未提交文件、不归档 09-09 以外的任务。

## 验收标准

- **AC1（R1）**：`git merge-base --is-ancestor upstream/main HEAD` 为真；合并提交存在；
  9 项功能各有定位证据。
- **AC2（R2）**：`ChatWindow.tsx` 同时具备 `next/image` 静态图标、`16 / (16|52)` padding、
  内层 `maxWidth + margin: 0 auto`、`{askUserCardInColumn}` 列内位置、`relative shrink-0`
  内的 `chatInputElement` + `ExtensionStatusBar`；无冲突标记。
- **AC3（R3）**：3 个 agent 文件任务前后 SHA256 一致，且不出现在任何本次提交中。
- **AC4（R4）**：`node -p` 读到的 next = 16.3.5；`npm ls next` 无错误；`pnpm-lock.yaml`
  无 `next@16.3.1`；两锁 diff 只涉及 next 家族。
  **口径补注（2026-09-18，D6 裁定）**：`pnpm-lock.yaml` 严格只涉及 next 家族（next 家族
  block 替换 + 根 importer + `time: {}`）；`package-lock.json` 另外含上游 `e5a2434` 自带的
  `sharp`/`@img/sharp-*`/`@humanfs/*`/`@xmldom/xmldom`/`fastq`/`js-yaml` 条目与新增
  `@humanfs/types`。判定条件：这些额外条目必须能追溯为上游提交内容，且本次 `npm install`
  不得产生额外改动（实测安装前后 `package-lock.json` 逐字节相同）。
- **AC5（R5）**：tsc 退出 0；lint 无新增诊断（历史诊断逐条列出）；全量单测全绿；
  5 个上游新增/修改测试文件专项全绿；真实命令/退出码/计数写入 `research/merge-execution.md`。
- **AC6（R6）**：隔离 `npm ci`、隔离 build、tgz 审计、生产安装 smoke、publish dry-run 全部退出 0
  且证据落盘；远端 exact = 0.9.4、latest = 0.9.4、tarball SHA512 与本地审计值一致。
- **AC7（R7、R8）**：真实 publish 有用户单独批准记录；未发生 push / tag / GitHub Release /
  主目录 build；未执行的验证项（E2E、浏览器 smoke）在报告中明确列为未覆盖，
  不以其它证据冒充。

## 开放项

- **V1 版本号语义（2026-09-18 已确认：直接 0.9.4）**：registry latest 已是 `0.9.3`
  （09-13 已真实发布但**未提交**本地 bump），本地 `package.json` 仍是 `0.9.2`。
  用户选择**直接发 `0.9.4`**，不补 0.9.3 的本地提交；本地 git 版本序列跨过 0.9.3 这一事实
  必须写进发布报告与 bump 提交信息，供日后追溯。

## 目标与用户价值

将 upstream/main 在 v0.9.1 之后新增的 9 个提交合入 personal，拿到上游的安全补丁
（Next.js RCE 补丁、登录限流、cookie SameSite）、worktree 大仓支持与若干 UI 修复，
同时保持全部 personal 定制（Trellis 快照、ask_user、聊天字号、增量缓存、发布配置）
不回归。

## 已确认事实（2026-09-18 只读调研）

- 起点 `L = origin/personal = 391c141260a6c8eb5dfc9a8457bcbfcf72055aad`（工作区 4 项未提交：
  3 个用户自己的 `.pi/agents/trellis-{check,implement,research}.md` 修改 + 未跟踪的
  `.trellis/tasks/09-13-npm-patch-release/`）。
- 目标 `U = upstream/main = 860698a6573e63a2432157676a5ac9bc9ce54044`；共同祖先
  `B = 8366762fa4b4ef3327f1b19e8ff7bf891a14c06c`（= 上游 `v0.9.1` tag）。
  即 B→U 恰好 9 个提交、无 merge 提交、无新 tag；personal 已包含 B。
- 领先/落后：`origin/personal` 领先 U 67 个提交，落后 9 个。
- 9 个提交内容（逐条 stat 与关键 diff 已核对）：
  1. `135517b` 新会话品牌区对齐：π 文字 logo → `next/image` 静态图标，外层 `mx-auto w-full +
     maxWidth` 改为内层 `maxWidth + margin: 0 auto`，padding 改为 `16px / (isMobile ? 16 : 52)`。
  2. `c04bab7` 文件 API 保留 UNC 根路径（`lib/file-paths.ts` + 2 个新测试，含 `AGENTS.md`）。
  3. `c1e544b` `pi_web_session` cookie 由 `SameSite=Strict` 改 `Lax`（修移动端外部跳转掉登录）。
  4. `fcd94bf` 扩展对话框标题保留换行（对齐 pi TUI）+ 新测试。
  5. `e5a2434` `next` / `eslint-config-next` 16.3.1 → **16.3.5**，`next.config.ts` 新增
     `images: { unoptimized: true }` 关闭 `/_next/image`（补 GHSA-2xp9-vwfh-vxw4 /
     GHSA-p293-qw3h-jr36 未授权 RCE），`package-lock.json` 随之更新（含 sharp 0.35.4）。
  6. `ed0eea9` 扩展下拉键盘选中项加 `scroll-margin`，避免 focus ring 被 overflow 裁切。
  7. `20ad98b` 新增 `lib/auth-throttle.ts`：`POST /api/web-auth` 全局指数退避（1s→60s，
     成功或闲置 5 分钟重置），阻塞时 429 + `Retry-After`，登录页展示等待；含 2 个新测试、
     3 个 i18n 文案、`AGENTS.md` 说明。
  8. `744ee93` worktree：`git()` 超时可配置（fetch 60s、`worktree add` 5min），本地无分支时
     从 `refs/remotes/origin/<branch>` 远端 tip 建分支（最终版去掉隐式 fetch）。
  9. `860698a` **最终落地只改 `app/globals.css` 一行**：`.extension-widget-content` 的
     `font-size: 14px` → `calc(14px + var(--chat-font-size-offset, 0px))`，即扩展 widget
     字号跟随聊天字号（原 PR 的独立 `extensionWidgetFontSize` 设置项已在 PR 内被撤销）。
- personal 与 U 的改动文件交集 9 个：`AGENTS.md`、`app/globals.css`、`components/ChatWindow.tsx`、
  `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`、`lib/worktree.ts`、`package.json`、`package-lock.json`。
  `AGENTS.md` 被 U 改了两处（worktree、auth 限流），personal 侧同样有大量自有内容。
- `git merge-tree --write-tree origin/personal upstream/main` 预演（只读）：**只有 1 个文本冲突**，
  位于 `components/ChatWindow.tsx` 新会话品牌区（`135517b` 的 hunk）。原因：personal 为把
  ask_user 卡片放进消息列（`a60377e`/`897a0e4`）把品牌区从 `relative shrink-0` 包装层里提出来，
  并在其后插入 `{askUserCardInColumn}`；上游改的是同一块 JSX 的内容与布局。
- 其余文件均自动合并，且语义一致：
  - personal 早已存在 `--chat-font-size-offset`（`app/globals.css`，来源自聊天字号功能），
    合并后 `.extension-widget-content`、消息正文、代码块共用同一 offset，`860698a` 语义成立。
  - personal 的 `askUserCardInColumn` 已经使用 `padding: 0 16px 12px; paddingRight: isMobile ? 16 : 52`
    （注释写明 "same padding as ChatInput"），与上游品牌区新 padding 完全一致。
- personal 的 `next.config.ts` 相对 B 无任何改动，`images.unoptimized` 可干净落入。
- personal 同时跟踪 `package-lock.json` 与 `pnpm-lock.yaml`（两者都已提交）；当前
  `node_modules/next` 仍为 16.3.1，`pnpm-lock.yaml` 中也锁在 `next@16.3.1`。
  仓库脚本用 npm（`npm run dev` / `next dev`），AGENTS.md 亦记录 npm 流程。
- 版本线：personal `package.json` = `0.9.2`；**npm 上 `@xup3ng/pi-web` 的 latest 已是 `0.9.3`**
  （09-13 任务已真实发布，本次只读 `npm view` 核实）。上游 `package.json` 仍为 `0.9.1`。
- 当前 `30141` 端口无监听（无 dev server 占用本 checkout）。
- `pnpm-lock.yaml` **不是装饰品**：`.github/workflows/release-personal.yml` 用 pnpm 10 +
  `pnpm install --frozen-lockfile` 构建 GitHub Release 产物，因此它必须与 `package.json` 一致。
- pnpm 锁同步方式的隔离探针（`/tmp/pnpmprobe`，不触碰仓库）结论：
  `pnpm update ...`、默认 `pnpm install --lockfile-only` 都会把 `@typescript-eslint/*`、
  `zod`、`@napi-rs/wasm-runtime` 等**无关依赖**一并升版；只有
  `pnpm install --lockfile-only --config.resolutionMode=time-based` 的变化范围仅限 next 家族
  （结构化 block 比对，详见 research 5.1）。
- 发布相关：npm 上 latest 已是 `0.9.3`（09-13 真实发布，但本地 `package.json` 仍是 0.9.2，
  即 0.9.3 未进入本地 git 历史）；`npm whoami` 当前返回 **401**，真实 publish 前需用户重新登录。
  磁盘可用约 65 GiB；09-13 的隔离发布目录与 `env.sh` / `check-run.py` 模式可复用（需新建 root）。

## 历史草案：要求（已被文末"已确认决策与最终要求"取代）

- R1 把 U 作为 personal 的祖先合入，保留全部 personal 定制；唯一冲突 `ChatWindow.tsx`
  必须人工解成"上游品牌区新内容 + personal 的列内 ask_user 卡片结构"。
- R2 保留用户未提交文件：不暂存、不提交、不覆盖 `.pi/agents/trellis-*.md`。
- R3 依赖与锁文件保持自洽：`next` 升到 16.3.5 后锁文件与 `node_modules` 状态一致，
  不引入无关依赖漂移。
- R4 合并后重新验证（类型、lint、单测；范围见待决策项），不继承历史"通过"结论。
- R5 不 push、不发布、不 build、不动用户真实数据与会话文件（除用户另行批准）。

## 历史草案：待确认决策（已全部确认，见文末）

- D1 任务归属：独立 09-18 任务，或作为 09-09（同步上游并发布新版本）的 child。
- D2 合并执行方式：主 checkout 直接 merge，或隔离 worktree + 候选分支（09-12 的做法）。
- D3 是否本次发新版本（npm latest 已是 0.9.3）。
- D4 锁文件与依赖安装策略（npm / pnpm / 两者）。
- D5 验证深度（tsc + lint + 全量单测 / 是否跑 E2E）。

## 历史草案：验收标准（已被文末 AC1–AC7 取代）

- AC1（R1）：U 是 personal 的祖先，无未解决冲突；9 个提交的每项功能都能在合并结果中定位。
- AC2（R1）：`ChatWindow.tsx` 同时具备上游品牌区新布局（`next/image` 静态图标、16/52 padding、
  内层居中）与 personal 的 `askUserCardInColumn` 列内位置。
- AC3（R2）：用户 3 个未提交 agent 文件在任务前后逐字未变。
- AC4（R3）：`package.json` / 锁文件 / `node_modules` 的 next 版本一致，`npm ls next` 无错误。
- AC5（R4）：记录真实命令与退出码，验证结果如实报告，未执行项明确列出。

## 范围外与风险

- 不向 upstream 推送、不重写历史、不升级 Trellis、不归档 09-09 以外的任务。
- 不跑 `e2e/run.mjs` 与浏览器手工 smoke（D5 的验证深度不含）；因此品牌区新布局、
  扩展下拉 `scroll-margin`、对话框标题换行、`images.unoptimized`、auth 限流在真实浏览器中的
  表现属于**未覆盖项**，必须在报告中显式列出，不能用单测/类型检查冒充。
- `ChatWindow.tsx` 是 personal 高改动密度文件（自 B 起 57+/21-），除已探测的 1 处文本冲突外，
  同文件内其它自动合并 hunk 仍需人工语义复核（A4）。
- 双锁文件（npm + pnpm）并存：pnpm 锁被 `.github/workflows/release-personal.yml` 使用
  （`--frozen-lockfile`），不同步会让该流水线失败；默认 pnpm 解析会带入无关漂移，
  必须用 time-based 解析（见 research 5.1）。
- 规划阶段未发现需要改 `scripts/**` 的理由；若实施中出现，视为范围外变更，另行申请。
