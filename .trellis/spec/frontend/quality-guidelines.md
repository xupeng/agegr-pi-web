# 质量规范

> pi-web 的检查命令、实际规则集与验证证据要求。

---

## 概览

本仓库的提交门禁是「三件套 + e2e」，四条命令覆盖不同层面：

| 门禁 | 命令 | 覆盖面 | 是否 type-aware |
|------|------|--------|-----------------|
| 类型 | `node_modules/.bin/tsc --noEmit` | 全部 `**/*.ts(x)` + `.next/types/**`（`tsconfig.json` 的 `include`） | 是 |
| Lint | `npm run lint`（= `eslint .`） | 仓库内全部 lint 目标（除 `.agents/.pi/.trellis`），数量随代码增长 | 否（`parserOptions.project` 为 undefined） |
| 单测 | `npm test` | `app/ components/ hooks/ lib/ public/` 5 个硬编码 glob | n/a |
| e2e | `npm run test:e2e` | 真实 Chromium，`E2E_SERVER_MODE` 为 `dev` 或 `start` | n/a |

基线的「形状」而非具体数字：`tsc` 0 错、`eslint` 0 error / 0 warning、`npm test` 全绿。
**本文件不写死文件数与用例数**（它们随代码增长与 ref 不同而变化，写死必然过期）。
每次验证都要在同一依赖树上复跑，记录当次实测数字与基线来源：

- 文件数：`node_modules/.bin/eslint . -f json` 输出数组的长度；
- 用例数：`npm test` 结束时的 `ℹ tests <N>`。

并按下面「验证基线」段的要求给出基线来源。
本文件既有的两段是硬要求，不要只看本段；下面的条目只做导航与补充。

- 基线必须来自与锁文件一致的依赖树 → 见 [验证基线必须来自与锁文件一致的依赖树](#验证基线必须来自与锁文件一致的依赖树)
- 数据链路脚本与真实浏览器运行必须分开报告 → 见 [数据链路脚本不等于浏览器验证](#数据链路脚本不等于浏览器验证)

---

## 禁止的模式

只列**可机检 + 有明确代价**的条目：

- **开发期跑 `next build`**：会污染 `.next/` 并让 `npm run dev` 失败（`AGENTS.md:11`、`docs/i18n.md:163`）；
  `e2e/run.mjs:18` 与 `e2e/subagents.mjs:13` 会直接 assert `.next/dev/lock` 不存在。
- **对话区排版表面的裸 `px` / `rem` 字号**：必须写成
  `calc(X + var(--chat-font-size-offset, 0px))`（`.trellis/spec/frontend/settings-dialog-mobile.md:60`）。
- **路径用 `===` 比较**：用 `lib/paths.ts:71 samePath()`；git 输出的 POSIX 绝对路径先过
  `toNativePath()`（`AGENTS.md`，Windows 上裸相等曾让 `isTopLevel` 恒假、worktree 切换器整体消失）。
- **`any` / `@ts-expect-error` / `enum`**：产品 TS/TSX 源码中 0 处；`no-explicit-any`、
  `ban-ts-comment` 是 `error` 级。非空断言实际有 66 处，现有 lint 不全面禁止它；
  新增时需有非空依据。统计范围与 AST 口径见 `type-safety.md`。
- **文件级 `/* eslint-disable */`**：全仓 0 处。豁免必须行内 + 指名规则 + 紧邻理由
  （现有 16 处 `eslint-disable-next-line`、2 处 `eslint-disable-line`，均指名规则）。
- **复制文件访问授权**：`lib/path-security.ts:10 isPathWithinRoots()`（`isFilePathAllowed()` 背后的唯一实现）
  是安全边界，不许复制。
- **把数据链路脚本当成浏览器验证**：见下面「数据链路脚本不等于浏览器验证」段。

---

## 必须遵循的模式

- **提交前跑三件套**（`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`，三者退出码 0），
  并把计数与基线逐项对照记录在任务 `research/` 下；具体口径见「验证基线」段，不要只看数字是否变小。
- **新增用户可见文案必须同时改三语**（`en` / `zh-CN` / `zh-TW`）：
  `lib/i18n/registry.test.mjs:39` 强制 key 与占位符集合一致，`:32` 精确断言
  `getSupportedLocales()` 为 `["en", "zh-CN", "zh-TW"]`。文案规则见 `docs/i18n.md`。
- **新增测试放 5 个 glob 目录内**（`app/ components/ hooks/ lib/ public/`）：`npm test` 的 glob 在
  `package.json` 里硬编码，其它目录里的测试不会被跑到。
- **凭证 / 设置写入用原子写**：`lib/atomic-file.ts:9 writePrivateFileAtomicSync`
  （临时文件 + `renameSync`，`mode: 0o600`）；settings / credential 另用 `proper-lockfile`
  （`lib/powershell-settings.ts`、`lib/provider-credential-store.ts`）。
- **`enabledModels` 模式不得当字符串比较**：走 `lib/model-scope.ts` → SDK 的
  `resolveModelScopeWithDiagnostics()`（见 `AGENTS.md` 的 model-scope 段）。
- **toolCall 字段差异只在一处归一**：`lib/normalize.ts:57 normalizeToolCalls()`，
  `lib/session-reader.ts` 与 `hooks/useAgentSession.ts` 两侧都必须调用。
- **lint 期望**：`@typescript-eslint/no-explicit-any` 与 `ban-ts-comment` 是 `error` 级，
  新增代码不得触发；组件 HTML 断言不引入 DOM 测试库（本仓库无 jsdom / testing-library）。

---

## 测试要求

### 验证基线必须来自与锁文件一致的依赖树

#### 机制：两套受跟踪 lockfile 钉了不同的 `eslint-plugin-react-hooks`

本仓库同时跟踪 `package-lock.json`（上游 CI 用 `npm ci` + `npm run lint`）与 `pnpm-lock.yaml`
（fork 自有，`release-personal.yml` 用 `pnpm install --frozen-lockfile`，只 build 不 lint）。
两者钉的 `eslint-plugin-react-hooks` 版本**不同**，而 `eslint-config-next` 对该插件的依赖范围是
`^7.0.0`：**同一份源码在两棵树上会得到不同的诊断集合**。

实测（2026-09-22，`personal@5402a5f`，两条命令各自干净安装、同一份源码）：

| 安装来源 | `eslint-plugin-react-hooks` | 覆盖文件 | error |
|---|---|---|---|
| `npm ci`（package-lock.json） | 7.0.1 | 495 | 0 |
| `pnpm install --frozen-lockfile`（pnpm-lock.yaml） | 7.1.1 | 495 | 14 条 `react-hooks/preserve-manual-memoization` |

覆盖文件数完全相同、规则严重级别都是 `error`，唯一变量就是插件版本 ⇒ 诊断差异**由 lockfile 决定**，
与源码状态无关。2026-09-18 那次记录的同一现象曾被归因为"旧树污染"，那个结论不完整：
污染不是必要条件，用 `pnpm-lock.yaml` 做干净安装同样复现。

> 上表的 14 条是 **`personal@5402a5f` 的修复前实测值**，不是当前的期望值：同一日的
> `09-22-lint-baseline-drift` 任务已把这批诊断修到两棵树都是 0。保留这组数字是为了说明机制与
> 判定方式；维护时请以"同一次运行内实测 + 两棵树都要跑"为准，不要照抄这里的计数。

#### 识别特征：这棵 `node_modules` 是混合树

按顺序检查，命中即应视为"基线不可信"：

1. `node_modules/.pnpm/` 与 `node_modules/.ignored/` 同时存在（pnpm 装过、npm 又装过）；
2. 存在 `node_modules/.modules.yaml`（pnpm 元数据）或 `node_modules/.package-lock.json`（npm 元数据）；
3. `package-lock.json` 期望的嵌套插件路径
   （`node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks`）缺失，
   而 `.pnpm/eslint-plugin-react-hooks@<ver>_*/` 存在；
4. 最直接的信号：**同一份源码在两棵树上诊断数不同**，或 `npm run lint` 的历史基线与本次差异
   无法用"新增/删除文件"解释。

#### 恢复动作

```bash
# npm 树（与上游 CI 同构）
npm ci

# pnpm 树（与 release-personal.yml 同构；本机 pnpm 12 会 ERR_PNPM_IGNORED_BUILDS，
# 必须用 workflow 钉的 pnpm 10 且显式设置 CI，否则非 TTY 下会中止）
CI=true npx --yes pnpm@10 install --frozen-lockfile
```

**不要**用 `npm install` / `pnpm install` 原地修补已经混合的树：只有在干净安装的树上得到的
诊断数才是基线。

#### 判定口径

- 报告"lint 无新增诊断"时，必须同时给出**基线是怎么得到的**（哪棵树、哪条安装命令、哪个 ref），
  并在诊断数量变化时做归因（规则级别 / 文件覆盖数 / 插件与 config 版本 / 依赖树一致性），
  **不允许用"数字变小了"或"与上次一样"直接当通过**。
- 涉及 lint 结论的验证，**两棵树都要跑**：`npm ci` 树给上游口径，pnpm 树给 fork 发布口径；
  只报其中一棵会漏掉由插件版本差异引起的真实诊断。
- 交叉验证首选：`git write-tree` + `git commit-tree`（不写任何 ref）拿到候选树，
  在独立 worktree 里 `npm ci` 后复跑 tsc / lint / `npm test`，
  这样既隔离了并发会话的未提交改动，也保证依赖来自锁文件。
  **不要**把带 `node_modules` 的临时 worktree 建在 `/tmp`（本机 `/tmp` 是 2 GiB tmpfs，
  两个 `node_modules` 就会 `ENOSPC`）；用仓库同级的普通目录。
- 提交前的最小集合：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`
  三者退出码为 0，且计数与基线逐项对照记录在任务 `research/` 下。

### 数据链路脚本不等于浏览器验证

同一功能可能有两类证据，报告时必须分开写，不能互相冒充：

- **数据链路脚本**：用真实 session 文件直接跑纯函数/提取层（例：`research/verify-e2e.mjs`
  跑出 24 个产物、`research/verify-ac5.mjs` 量出 1242 → 1929 条路径）。它证明数据正确，
  **不能**证明点击、右栏、视口布局。
- **真实浏览器运行**（Playwright + 已安装的 Chromium）：凡依赖点击、右栏打开、viewport 的
  断言都必须真跑（例：`e2e/clickable-file-paths.mjs`），并把断言输出与截图留在任务
  `research/` 下。跑不起来时必须区分「环境阻塞」与「功能失败」，未覆盖的项就写「未覆盖」，
  禁止用代码阅读推断成通过。
- 沿用的既有前提：`e2e/` 依赖真实 dev server（先查端口、复用健康进程，禁止 `next build`）；
  本机 Playwright 默认 revision 可能未安装，需显式使用已安装的 chromium headless shell。

---

## Code Review 检查清单

每项都能被命令或文件证据验证，避免「注意代码质量」这类空话：

- [ ] `node_modules/.bin/tsc --noEmit` 退出码 0
- [ ] `npm run lint` 退出码 0；诊断数有变化时完成归因（规则级别 / 文件覆盖数 /
      plugin + config 版本 / 依赖树一致性）
- [ ] `npm test` 全绿；新增用例落在 5 个 glob 目录内
- [ ] 与基线逐项对照已记录在任务 `research/` 下，且写明基线来源（哪个依赖树、哪次安装）
- [ ] 新增 `.ts` / `.tsx` 无 `any` / `@ts-expect-error` / `enum`；非空断言有明确依据
- [ ] 新边界输入走 `unknown` + 手写守卫，未新增 schema 校验库依赖
- [ ] `as` 有依据（如 `as const`、已窄化联合、CSS 自定义属性、SDK 适配或边界校验）；
      `as unknown as` 另检查适配边界或运行时证明，不用双重断言掩盖业务类型错误
- [ ] 新增 `eslint-disable` 是行内 + 指名规则 + 紧邻理由
- [ ] 新增用户可见文案三语齐全，`npm test` 的 i18n 一致性用例通过
- [ ] 对话区新增字号用 `calc(… + var(--chat-font-size-offset, 0px))`
- [ ] 涉及点击 / 右栏 / viewport 的断言跑过 Playwright（`npm run test:e2e`），
      未覆盖项明确标「未覆盖」
- [ ] 未在开发 checkout 跑过 `next build`（`git status` 确认 `.next/` 未被提交）

**a11y 的事实**：ESLint 里 `jsx-a11y/*` 只有 **6 条且全部是 `warn`**（`alt-text`、`aria-props`、
`aria-proptypes`、`aria-unsupported-elements`、`role-has-required-aria-props`、`role-supports-aria-props`），
本次本地检查 0 warning 仅说明未触发当前规则；`react-hooks/*` 多为 `error`，但 `immutability` / `refs` /
`set-state-in-effect` 被 `eslint.config.mjs:10-12` 有意关闭。因此 **「lint 通过」不等于 a11y 通过**，
可访问性主要靠组件测试断言（`renderToStaticMarkup` + 源码断言）与 e2e 覆盖；
不要新增依赖规则集，也不要打开被关闭的规则。
