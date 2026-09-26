# 目录结构与落位约定

> pi-web 的源码怎么放：真实目录树、新代码该落哪、命名规则、客户端/服务端边界、
> 路径别名与构建边界，以及该抄/该避的范例。
> 所有计数为实测值（排除 `node_modules`、`.next`、`.git`）。

---

## 总览

- **本仓库没有 `src/`**。源码在仓库根的 `app/ components/ hooks/ lib/ public/` 下，
  `tsconfig.json` 的 `paths["@/*"]` 也直接映射到**仓库根**（不是 `src/`，也不是 `lib/`）。
- 组织方式是**按技术层扁平组织**，不按 feature 建目录：`components/` 是平的
  （42 个 `.tsx` 直接躺在目录下，没有 `components/<Feature>/` 这种子目录）；
  `lib/` 有 127 个顶层 `.ts`。仅有的两个子目录 `lib/ask-user/`、`lib/i18n/` 是既有子系统。
- `README.md` 的 `## Repository Layout` 是同一份描述的另一入口；改结构时两边同步，
  避免两份说法漂移。

---

## 真实目录树

```text
仓库根
├── app/           80 files   Next.js App Router：UI 入口 + 全部 HTTP API
│   ├── api/       73 files   = 57 个 route.ts + 16 个 *.test.mjs
│   │   ├── agent/{new,running}/route.ts
│   │   ├── agent/[id]/{route,events/route,bash-output/route,lease/route}.ts
│   │   ├── sessions/{route.ts,search/route.ts,[id]/{route,state,context,export,auto-name}.ts}
│   │   ├── sessions/[id]/entries/[entryId]/{thinking,tool-result-image}/route.ts  ← 最深 7 层
│   │   ├── files/[...path]/route.ts            catch-all 动态段
│   │   ├── auth/{providers,api-key/[provider],login/[provider],logout/[provider]}/route.ts
│   │   ├── models/route.ts + models-config/{catalog,discover,test}/route.ts
│   │   ├── plugins/  skills/  subagents/  terminal/  git/  worktrees  file-index  cwd/
│   │   └── web-auth  push  provider-usage  project-trust  extension-ui  tools/settings …
│   ├── layout.tsx / page.tsx / manifest.ts
│   ├── login/page.tsx                         唯一另一个 page，也是唯一带 "use client" 的 app 文件
│   └── globals.css / settings.css             全局样式（CSS 变量、@font-face、对话区字号链）
├── components/    89 files   React 客户端组件（平铺）
│   ├── *.tsx               42   PascalCase 组件，全部具名导出
│   ├── *.ts                 3   kebab-case 组件内纯逻辑
│   ├── *.module.css         1   ChatMinimap.module.css（全仓库唯一 CSS Module）
│   └── *.test.mjs          43   与组件同目录同前缀
├── hooks/         19 files   11 个 use*.ts|tsx（全部首行 "use client"）+ 8 个测试
├── lib/          269 files   140 .ts（kebab-case，服务端 + 共享逻辑混合）+ 129 .test.mjs
│   ├── ask-user/           10   后端子系统：index.ts(barrel) + store/persist/tool/types/…
│   └── i18n/                8   format.ts + registry.ts + types.ts + messages/{en,zh-CN,zh-TW}.ts
├── e2e/            8 files   7 个 .mjs（Playwright 回归）+ README.md
├── bin/            5 files   npm CLI 入口 pi-web（CommonJS）
├── scripts/        1 file    release-npm.sh
├── docs/          13 files   9 .md（用户/贡献者指南 + adr/0001-0003）+ 4 张图片
├── public/        80 files   fonts/、icons/、sw.js、offline.html（随 npm 包发布）
├── .trellis/                 Trellis workflow（spec / tasks / scripts）
├── .agents/                  Trellis 技能（skills/*/SKILL.md）
├── .pi/                      本项目自己的 pi 配置（agents / prompts / extensions）
├── proxy.ts                  Next 16 的 middleware 替代物（auth + host 校验）
└── instrumentation.ts        注册 configureHttpDispatcher
```

### 依赖方向（按 TS/TSX 顶层静态 import 声明计数，含同目录相对导入）

| 目录 | 它 import 了 | 谁 import 它 |
|------|--------------|--------------|
| `app/` | `lib`(149)、`components`(2)、`hooks`(2)、`app`(2) | `app` 内部 |
| `components/` | `lib`(122)、`hooks`(48)、`components`(64) | `app`、同层 |
| `hooks/` | `lib`(23) | `components`、`app` |
| `lib/` | `lib`(143) | 全部 |

**硬规则：`lib/` 从不 import `components/`、`hooks/`、`app/`（实测 0 次）。**
不要向 `lib/` 引入反向的 React/UI 模块依赖；无 React 的 UI 纯逻辑可以放在 `lib/`。

---

## 新代码该放哪

| 你要加的东西 | 放这里 | 现有代表例 | 同时必须做 |
|--------------|--------|------------|------------|
| HTTP API 路由 | `app/api/<resource>/route.ts`；动态段 `app/api/<resource>/[id]/route.ts` | `app/api/worktrees/route.ts`（GET/POST/DELETE 同文件）、`app/api/sessions/[id]/route.ts`、`app/api/files/[...path]/route.ts` | 抄 `export async function GET(req: Request)`；鉴权/宿主校验已在 `proxy.ts` 统一处理，路由内只做业务校验（如 `isFilePathAllowed`） |
| 路由的服务端业务逻辑 | `lib/<feature>.ts`（kebab-case），路由文件保持薄 | `lib/worktree.ts` ← `app/api/worktrees/route.ts` | 补 `lib/<feature>.test.mjs` |
| 客户端纯逻辑（无 React、无 DOM） | 被 2 个以上组件用 → `lib/<feature>.ts`；只服务单个组件 → `components/<feature>.ts` | 跨组件：`lib/file-viewer-state.ts`、`lib/chat-scroll-position.ts`；单子系统：`components/file-tab-state.ts`、`components/models-config-helpers.ts`、`components/terminal-tab-state.ts` | 测试同目录同前缀 |
| 有状态的 React 逻辑（订阅 / 浏览器 API / timer） | `hooks/use<Thing>.ts`，首行 `"use client"` | `hooks/useAgentSession.ts`、`hooks/useViewportHeight.ts`、`hooks/useFileIndex.ts` | 把可判定的纯函数一并 `export` 供测试直接调用（如 `hooks/useViewportHeight.ts:12 shouldUseVisualViewportHeight`） |
| UI 原子组件 | `components/<PascalCase>.tsx`，具名导出，**不新建子目录** | `components/PathText.tsx`、`components/ThinkingIcon.tsx` | 见 `.trellis/spec/frontend/component-guidelines.md` |
| Context + Provider | `components/<Thing>Context.tsx`，同文件导出 `XProvider` 与 `useXContext()` | `components/FileIndexContext.tsx`（`FileIndexProvider` + `useFileIndexContext`） | 要说明 provider 缺席时的降级语义 |
| 前后端共享类型 | `lib/api-types.ts`（API DTO，19 处静态导入）、`lib/types.ts`（领域模型）、`lib/pi-types.ts`（pi SDK 结构化类型，5 处静态导入） | `import type { SessionInfo } from "@/lib/types"` | 只用 `import type`，别引入运行时 |
| i18n 文案 | `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 三份加**同名 key**，命名 `<namespace>.<camelCaseLeaf>` | namespace 分布：`chat`、`sidebar`、`models`、`settings`、`agents`… | 三份都要加；`lib/i18n/registry.test.mjs:39-54` 断言三语 key 集合与占位符一致，漏一份即红 |
| 新增一种语言 | `lib/i18n/messages/<bcp47>.ts` + 在 `lib/i18n/registry.ts` 注册 + 同步 `lib/i18n/types.ts` 的 `Locale` 联合类型 | `registry.ts` 的 `localePlugins` | 更新 `lib/i18n/registry.test.mjs` 的语言断言 |
| 浏览器一次性探针 / 发布脚本 | `e2e/<feature>.mjs` 或 `scripts/<name>.sh` | `e2e/themes.mjs`（顶部注释写明 `node e2e/themes.mjs`）、`scripts/release-npm.sh` | 要进 CI 就必须挂进 `package.json` scripts（见下） |
| 架构决策记录 | `docs/adr/<NNNN>-<kebab-slug>.md` | `docs/adr/0002-chat-only-tool-selection.md` | 序号递增、4 位补零 |
| 新的服务端原生依赖 | 加进 `next.config.ts:19-27` 的 `serverExternalPackages` | 现有 `node-pty`、`undici`、`web-push`、4 个 `@earendil-works/*` | 否则 Turbopack/构建会把原生包打进 bundle |
| 组件级新样式 | 先沿用所在组件的 inline style / 全局类；结构复杂时可用 `components/<Name>.module.css` | `components/ChatMinimap.tsx:13` | CSS Module 当前仅此一例；具体选择见组件规范，不把它写成所有新样式的唯一渠道 |
| 需要 fs / git / child_process 的模块 | 拆出纯逻辑 `lib/<name>-core.ts`（或 `-paths.ts`，不 import node），wrapper 只做 I/O 并 re-export | `lib/session-file-references-core.ts` ↔ `lib/session-file-references.ts`；`lib/file-index-paths.ts`（文件头注释写明 "Kept free of git/fs so it can be unit-tested without spawning a process"）；`lib/provider-listing.ts` ↔ `lib/provider-listing-runtime.ts` | 这样单测不需要 mock 文件系统 |

### 明确"不要"做的

- 不要建 `src/`。
- 不要建 `components/<Feature>/` 子目录 —— `components/` 是全平的。
- 不要建 `lib/<feature>/index.ts`。全仓库只有 1 个 barrel：`lib/ask-user/index.ts`（既有子系统）。
- 不要建 `tests/` 目录，不要引入 jest / vitest / testing-library
  （`package.json` 没有这些依赖，测试命令是 `node --test`）。
- 不要把 node-only 逻辑放进 `components/`（实测 0 例）。
- 不要在 `app/` 下放非路由的服务端 helper：`app/api` 里除 `route.ts` 外只有 `*.test.mjs`，
  业务逻辑一律外置到 `lib/`。

---

## 命名约定

| 对象 | 规则 | 实测 | 反例 |
|------|------|------|------|
| React 组件文件 | `PascalCase.tsx` | 42/42 | 无 |
| 组件内纯逻辑 | 与组件同目录的 `kebab-case.ts` | 3/3 | 无 |
| 通用库模块 | `lib/**/kebab-case.ts` | 140/140，**0 个文件名含大写** | 无 |
| Hook | `hooks/use*.ts`；需要 JSX 时 `use*.tsx` | 11/11 以 `use` 开头；仅 `useI18n.tsx` 是 `.tsx` | 无 |
| 单元测试 | 与被测代码同目录，通常同前缀 + `.test.mjs`；也有按主题命名的 `hooks/model-loading.test.mjs` | 198 个 `.test.mjs` 位于五个测试根目录 | 没有独立 `tests/`，没有 vitest/jest |
| 特性化测试 | `<Name>.<feature>.test.mjs` | `components/ChatInput.send-shortcut.test.mjs`、`hooks/useAgentSession.pending-ask.test.mjs`、`app/api/files/stream-route.test.mjs` | — |
| CSS | 全局只有 `app/globals.css`、`app/settings.css`；组件级必须 `*.module.css` | 3 个 css 文件 | 无其他 CSS 文件 |
| e2e 脚本 | `e2e/<feature>.mjs` | 见「e2e 与脚本」 | 没有 `.spec.ts` |
| 文档 / 决策 | `docs/<topic>.md`；`docs/adr/NNNN-kebab-slug.md` | `docs/adr/0001-isolate-project-command-environments.md` … | — |
| 组件导出 | `export function Name(...)`；memo 时 `export const Name = memo(function Name(...))` | `.tsx` 中 AST 导出的函数声明 102 个（含 async） | `export default` 出现 0 次 |

---

## 客户端与服务端边界

边界**不是靠目录划分的**，而是靠文件级 `"use client"` + `app/api/**` 是唯一路由层。

- `app/api/**` 全部是服务端（57 个 `route.ts`）。
- **`lib/` 是混合目录，不能整目录当服务端**：约 38 个 `lib/*.ts` import 了 node 内建模块
  （`fs`/`path`/`os`/`child_process`/`crypto`/`net`/`stream`/`readline`/`worker_threads` 等），
  例如 `lib/file-access.ts`、`lib/rpc-manager.ts`、`lib/session-reader.ts`、`lib/worktree.ts`；
  其余 89 个没有直接静态导入这些 node 内建模块；这不保证其传递依赖可进浏览器，
  客户端值导入前仍须检查依赖链。
  服务端边界**没有** `import "server-only"` 之类的守卫（实测 0 处），靠约定。
- 共 49 个文件带 `"use client"`：`components/` 37、`hooks/` 11、`app/login/page.tsx` 1。
  `hooks/` **全部**带，新 hook 默认加。

### 客户端复用含 node 的模块：只能 `import type`

同时被客户端和路由引用、又含 node 内建 import 的模块，客户端侧一律只用类型：

| 模块 | node import | 客户端引用方式 |
|------|-------------|----------------|
| `lib/session-search.ts` | `node:fs`、`node:readline` | `components/SessionSearch.tsx:7 import type { SessionSearchResponse }` |
| `lib/subagents.ts` | `fs`、`path` | `components/AgentsConfig.tsx:10 import type { SubagentProfile, ... }` |
| `lib/terminal-manager.ts` | `os` | `components/TerminalPanel.tsx:8 import type { TerminalEvent }` |

同一族约束（`AGENTS.md` 的 Windows 路径段）：**浏览器代码不能套用 node 的路径规则**。
`lib/paths.ts` 的能力必须在服务端预先解析（`/api/worktrees` 返回已解析的 `currentWorktreePath`），
客户端不得自行比较路径。

### 同一模块里既有纯浏览器 helper 又有 node 读取：必须拆开

2026-09-26（PR #9）实测：`lib/ask-user/view-fonts.ts` 曾是「纯函数 + `readViewFontManifest()`」
的混合体（后者用 `await import("node:fs/promises")` 与 `await import("node:path")`），
被 `"use client"` 的 `components/AskUserAppHost.tsx` **值导入**（链路 `ChatWindow.tsx` → `AppShell.tsx`）：

| 校验 | 结果 |
|------|------|
| `tsc --noEmit` | 通过 |
| `node --experimental-strip-types --test` | 通过（node 自己解析 `node:` 没问题） |
| `npm run dev`（Turbopack） | 通过 —— 所以本地 dev 验证**跑不出**这个问题 |
| `npm run build`（`next build --webpack`，CI 的 e2e job 第一步） | 失败：`Module build failed: UnhandledSchemeError: Reading from "node:fs/promises" is not handled by plugins` |

结论：客户端可达的模块只能是纯浏览器代码，node 读取单独放服务端模块
（现状：`lib/ask-user/view-fonts.ts` 纯函数 + `lib/ask-user/view-font-manifest.ts` 只读文件，
由 `app/api/ask-user/font-faces/route.ts` 值导入后者）。**动态 `await import("node:…")` 不是豁免**：
webpack 在构建期按字面量解析它，`next dev` 才容忍。自检方式：
`grep -n "node:" <被客户端值导入的模块>` 必须为空 —— `lib/ask-user/view-fonts.test.mjs`
有一条断言把这条规则钉住，文件读取的那半边另测在 `view-font-manifest.test.mjs`。

---

## 路径别名与构建边界

### `@/` ↔ `./` ↔ `../`

- 跨目录通常 `@/`（AST 静态 import 357 次）。同目录通常 `./`（193 次，如
  `components/AppShell.tsx:11 import { openFileTab, saveFileViewerState } from "./file-tab-state"`）。
- `../` 静态 import 只有 5 次，且**全部在 `lib/` 的子目录内**
  （`lib/ask-user/persist.ts`、`lib/ask-user/extension.ts`、`lib/i18n/messages/{en,zh-CN,zh-TW}.ts`）——
  从子目录写 `@/lib/ask-user/...` 更啰嗦，现状选择相对路径。

### 构建/校验边界

- `tsconfig.json` 的 `include` 是 `**/*.ts` + `**/*.tsx`，
  **`*.test.mjs` 与 `e2e/*.mjs` 不参与 `tsc` 类型检查**，正确性只靠运行时。
- `next.config.ts:19-27 serverExternalPackages` 见「新代码该放哪」。
- `eslint.config.mjs` 用 `eslint-config-next` 的 `core-web-vitals` + `typescript` 两套 flat config，
  **忽略 `.agents/**`、`.pi/**`、`.trellis/**`**，并关掉 `react-hooks/immutability`、
  `react-hooks/refs`、`react-hooks/set-state-in-effect`（代码里依赖这些关闭，别照搬通用规则）。
- `npm test` 的 glob 只覆盖 `app/ components/ hooks/ lib/ public/` 五个目录 ——
  **新测试放到别处不会被跑到**。

---

## e2e 与脚本（两类，别混）

**A. 进 CI 的 harness**（`package.json` 只挂了 3 个）：

| npm script | 命令 |
|------------|------|
| `test:terminal` | `node e2e/terminal.mjs` |
| `test:e2e` | `node e2e/run.mjs && node e2e/subagents.mjs` |
| `test:e2e:subagents` | `node e2e/subagents.mjs` |

约定：可复用的特性检查写成 `e2e/<feature>.mjs` 并 `export async function check<Feature>(...)`，
由 `e2e/run.mjs` import 组装（如 `e2e/chat-appearance.mjs`、`e2e/extension-dialog.mjs`）；
独立整套回归保持"自包含单文件 + 自己的 npm script"（`e2e/subagents.mjs`、`e2e/terminal.mjs`
自己 spawn server、自建 fixture、自己 launch chromium）。

**B. 本地一次性探针**（不在 `package.json` 里）：`e2e/themes.mjs`、`e2e/clickable-file-paths.mjs`。
顶部注释必须写清运行方式与 base URL 来源（如 `E2E_BASE_URL`，默认 `http://127.0.0.1:30141`）。

命名习惯：`package.json` 的 script 用**冒号分层** `<类别>:<子集>`（`test:e2e:subagents`、`start:lan`）。

---

## 该抄的范例 / 该避免的反例

**抄这些：**

- API 薄路由 + 业务逻辑外置：`app/api/worktrees/route.ts` → `lib/worktree.ts`。
- 纯逻辑外提以便测试：`lib/file-index-paths.ts` ← `app/api/file-index/route.ts`（唯一引用者）。
- core / wrapper 拆分：`lib/session-file-references-core.ts`（纯判定 + `isValidSessionId`）↔
  `lib/session-file-references.ts`（`resolveSessionPath` + `getSessionEntries`，并 re-export core）。
- 组件 + 纯逻辑 + 测试三件套：`components/AppShell.tsx` / `components/file-tab-state.ts` /
  `components/AppShell.terminal.test.mjs`。
- hook 额外导出纯函数：`hooks/useViewportHeight.ts`（`shouldUseVisualViewportHeight`、`KEYBOARD_RETRY_DELAYS`）。
- 唯一 barrel 的用法：`lib/ask-user/index.ts` —— 因为它是子系统，不是"每个模块都来个 index"。

**别这样：**

- 在 `app/api/**/route.ts` 里写业务逻辑，或新建 `app/api/_lib.ts` 之类的非路由 helper。
- 把 `components/` 里的 4 个巨型文件继续放大的同时认为"扁平就是随便加"
  （`ChatInput.tsx` 3005 行、`SessionSidebar.tsx` 2700 行、`AppShell.tsx` 2520 行、
  `ModelsConfig.tsx` 2170 行是现状，不是可复制目标）。
- 从 `lib/` 反向 import `components/` / `hooks/` / `app/`。
- 在客户端文件里对含 node 内建 import 的 `lib/` 模块做值导入。
- 把测试放到目录外（`npm test` 的 glob 会漏掉）。
