# Research: 真实目录结构 / 命名 / 落位规则（供 `frontend/directory-structure.md`）

调研对象：`/home/xupeng/dev/personal/forked/agegr-pi-web`（pi-web，Next 16 App Router + React 19，v0.9.4）。
调研方式：只读扫描（`find` / `grep` / `wc`），未修改任何产品代码或 spec。
所有计数均为本次调研实测值（排除 `node_modules`、`.next`、`.git`、`test-results`）。

---

## 0. 结论速览（写 spec 前先看这段）

1. 现有 `directory-structure.md` 里的 `src/` 目录树是模板占位符，**本项目没有 `src/`**；源码在仓库根目录的 `app/ components/ hooks/ lib/ public/` 下。
2. 仓库已有一份**真实的目录说明**：`README.md` 的 `## Repository Layout` 小节（段落式，6 行）。spec 应当把它扩写成带规则的形式，而不是另起一套说法。
3. 强约定（实测无例外）：
   - `components/*.tsx` 一律 `PascalCase.tsx`（42/42），且全部具名导出、**0 个 `export default`**。
   - `lib/*.ts` 一律 `kebab-case.ts`（140/140，无一个大写字母）。
   - `hooks/*` 一律 `use*.ts|tsx`（11/11），且全部文件首行是 `"use client";`。
   - 测试与被测文件**同目录、同前缀** `*.test.mjs`（198 个），`node --test` 直跑，**没有 `tests/` 目录、没有 vitest/jest**。
   - 跨目录 import 一律用 `@/`（359 次）；`../` 全仓库只有 5 次（都在 `lib/` 子目录内）。
4. 服务端/客户端边界不是靠目录，而是靠**文件级** `"use client"` + 路由层只在 `app/api/**`。
   `lib/` 里 38 个模块 import node 内建模块；客户端要复用它们的**类型**时必须 `import type`（实测 3 例，见 §4.3）。
5. 存在一种可复用的拆分范式，全仓库共 4 组（见 §4.4）：纯逻辑 `-core.ts` / `-ids.ts` / `-auth.ts` / `-runtime.ts` + 带 I/O 的 wrapper。

---

## 1. 真实目录树与规模

### 1.1 顶层（本次实测文件数）

| 路径 | 文件数 | 职责 | 是否随 npm 包发布 |
|---|---|---|---|
| `app/` | 80 | Next.js App Router：UI 入口 + 全部 HTTP API | 否（构建产物 `.next/` 发布） |
| `components/` | 89 | React 客户端组件 | 否（打进 `.next/`） |
| `hooks/` | 19 | 客户端状态与交互 hook | 否（打进 `.next/`） |
| `lib/` | 269 | 服务端逻辑 + 浏览器纯逻辑 + 共享类型（混合目录） | 否（打进 `.next/`） |
| `e2e/` | 8 | Playwright 浏览器回归脚本 | 否 |
| `bin/` | 5 | npm CLI 入口（`pi-web`） | **是**（`package.json` `files`） |
| `scripts/` | 2 | 发布脚本（`.sh`） | 否 |
| `docs/` | 13 | 用户/贡献者指南 + ADR | 否 |
| `public/` | 80 | 静态资源、字体、图标、PWA（`sw.js`/`offline.html`） | **是** |
| `.trellis/` | 265 | Trellis workflow（spec/任务/脚本） | 否 |
| `.agents/` | 43 | Trellis 技能文件（`skills/*/SKILL.md`） | 否 |
| `.pi/` | 8 | 本项目自己的 pi 配置（agents/prompts/extensions） | 否 |
| `.pi-web/` | 7 | 运行期附件（gitignore） | 否 |

仓库根的其他单体文件（都在真实结构中占位，应写进 Layout）：
`proxy.ts`（Next 16 的 middleware 替代物，含 auth + host 校验）、`instrumentation.ts`（注册 `configureHttpDispatcher`）、`next.config.ts`、`eslint.config.mjs`、`tailwind.config.ts`、`postcss.config.mjs`、`tsconfig.json`、`AGENTS.md`、`CONTEXT.md`、`README*.md`（4 语言）。

### 1.2 展开树（只展开到有信息的层）

```text
app/                                80 files
├── api/                            73 files = 57 route.ts + 16 *.test.mjs
│   ├── agent/{new,running}/route.ts            POST 新建 / GET running 快照
│   ├── agent/[id]/{route,events/route,bash-output/route,lease/route}.ts
│   ├── sessions/route.ts, sessions/search/route.ts, sessions/[id]/{route,state,context,export,auto-name}.ts
│   ├── sessions/[id]/entries/[entryId]/{thinking,tool-result-image}/route.ts   ← 最深 7 层
│   ├── files/[...path]/route.ts                ← catch-all 动态段
│   ├── auth/{providers,api-key/[provider],login/[provider],logout/[provider]}/route.ts
│   ├── models/route.ts, models-config/{catalog,discover,test}/route.ts
│   ├── plugins/{route,check}, skills/{route,check,install,search,update}
│   ├── subagents/settings/route.ts, subagents/profiles/route.ts, subagents/[id]/route.ts
│   ├── terminal/{route,[id]/route,[id]/events/route}
│   ├── git/{status,diff}, worktrees, file-index, cwd/{browse,validate}, default-cwd, home
│   └── ...（web-auth、push、provider-usage、project-trust、extension-ui、tools/settings…）
├── layout.tsx / page.tsx / manifest.ts         ← 根布局、唯一页面入口、PWA manifest
├── login/page.tsx                              ← 唯一另一个 page，且是唯一带 "use client" 的 app 文件
├── globals.css / settings.css                  ← 全局样式（globals 1783+ 行，含 CSS 变量与 @font-face）
└── favicon.ico

components/                         89 files
├── *.tsx                42  PascalCase 组件（全部具名导出，0 个 export default）
├── *.ts                  3  kebab-case 组件内纯逻辑：file-tab-state.ts / models-config-helpers.ts / terminal-tab-state.ts
├── *.module.css          1  ChatMinimap.module.css（全仓库唯一 CSS Module）
└── *.test.mjs           43  与被测组件同目录同前缀

hooks/                              19 files
├── use*.ts              10  useAgentSession/useAudio/useChatAppearance/useDragDrop/useFileIndex/
│                            useIsMobile/useKeyboardShortcuts/useResizablePanel/useTheme/useViewportHeight
├── useI18n.tsx           1  ← 唯一 .tsx（内含 I18nProvider 组件，所以用 tsx）
└── *.test.mjs            8

lib/                               269 files = 140 .ts + 129 .test.mjs
├── *.ts                127  kebab-case 服务端/共享模块（无一个大写字母）
├── *.test.mjs          124
├── ask-user/            10  = index.ts(barrel) + extension/store/persist/tool/types/resolve-pending-ask + 3 tests
└── i18n/                 8  = format.ts + registry.ts + types.ts + messages/{en,zh-CN,zh-TW}.ts + 2 tests

e2e/                                8 files = 7 .mjs + README.md
bin/                                5 .js（CommonJS，共 351 行；pi-web.js 是 bin 入口）
scripts/                            2 .sh（release-npm.sh / release-personal.sh）
docs/                              13 files = 9 .md（含 adr/0001..0003）+ 4 图片
public/                            80 files
├── fonts/               6  Cascadia Code woff2 + LICENSE/NOTICE
├── icons/               3  png + catppuccin/（66 svg，latte/mocha 两主题 + README + LICENSE）
├── sw.js + sw.test.mjs  Service Worker（有单测）
├── offline.html         PWA 离线页
├── provider-icons.svg   sprite
└── fonts.test.mjs       静态资源也有测试
```

### 1.3 依赖方向（实测，无反向）

| 目录 | 它 import 了 | 谁 import 它 |
|---|---|---|
| `app/` | `lib`(149) `components`(2) `hooks`(2) | 无 |
| `components/` | `lib`(123) `hooks`(48) 同目录(1) | `app` |
| `hooks/` | `lib`(24) | `components`、`app` |
| `lib/` | `lib`(10) | 全部（`app`/`components`/`hooks`） |

**`lib/` 从不 import `components/`、`hooks/`、`app/`**（实测 0 次）→ 这是单向依赖，可直接写成硬规则。

---

## 2. 命名约定（附占比证据）

| 对象 | 规则 | 实测 | 反例 |
|---|---|---|---|
| React 组件文件 | `PascalCase.tsx` | 42/42 `.tsx` 全为 PascalCase | 无 |
| 组件内纯逻辑 | `kebab-case.ts` 与组件同目录 | 3/3（`file-tab-state.ts`、`models-config-helpers.ts`、`terminal-tab-state.ts`） | 无 |
| 通用库模块 | `lib/` 下 `kebab-case.ts` | 140/140，**0 个文件名含大写** | 无 |
| Hook | `hooks/use*.ts`；需要 JSX 时 `use*.tsx` | 11/11 以 `use` 开头；仅 `useI18n.tsx` 是 `.tsx` | 无 |
| 单元测试 | 与被测文件**同目录同前缀** + `.test.mjs` | 198/198；`lib` 127 个 `.ts` 中 107 个有同名 `.test.mjs` | 无独立 `tests/`、无 vitest/jest |
| 特性化测试命名 | `<Name>.<feature>.test.mjs` | 24 例，如 `components/ChatInput.send-shortcut.test.mjs`、`hooks/useAgentSession.pending-ask.test.mjs`、`app/api/files/stream-route.test.mjs` | — |
| CSS | 全局 `app/*.css`；组件级必须 `*.module.css` | 3 个 css：`app/globals.css`、`app/settings.css`、`components/ChatMinimap.module.css` | 无其他 CSS 文件 |
| e2e 脚本 | `e2e/<feature>.mjs`，导出 `check<Feature>()` 供 `run.mjs` 调用 | 见 §6 | 无 `.spec.ts` |
| 文档 | `docs/<topic>.md`；决策记录 `docs/adr/NNNN-kebab-slug.md` | `0001-isolate-project-command-environments.md` … `0003-…` | — |
| 组件导出形式 | `export function Name(...)`；需 memo 时 `export const Name = memo(function Name(...))` | 65 个 `export function`；`MessageView.tsx:302` 为 memo 变体 | `export default` 出现 0 次 |
| Props 类型 | 文件内 `interface Props`（不导出）为主；跨组件复用时 `interface XxxProps` | 16 个文件用 `interface Props`；其余用 `XxxProps` | 无 `type Props =` 命名冲突 |

补充（写 spec 时有用，但与目录关系较弱的可省略）：
- 组件为了可测，会额外导出纯函数（`components/*.tsx` 中共 46 个 `export function <小写名>`），例：`SessionSidebar.tsx` 的 `getSessionListIndices`、`MessageView.tsx` 的 `getTokenEstimateText`。测试直接断言这些函数。
- 只有 1 个 barrel：`lib/ask-user/index.ts`。**不要默认新建 `index.ts`**。
- `components/*.tsx` 中 37/42 首行是 `"use client"`；5 个不带的都是纯展示/图标类：`FileIcons.tsx`、`ProviderIcon.tsx`、`SystemPromptPanel.tsx`、`ThemeIcon.tsx`、`ThinkingIcon.tsx`（由客户端父组件引入）。

---

## 3. 新代码该放哪（决策表，每行给真实同类文件）

| 你要加的东西 | 放这里 | 现有代表例 | 同时必须做 |
|---|---|---|---|
| HTTP API 路由 | `app/api/<resource>/route.ts`；动态段 `app/api/<resource>/[id]/route.ts` | `app/api/worktrees/route.ts`（GET/POST/DELETE 同文件）、`app/api/sessions/[id]/route.ts`、`app/api/files/[...path]/route.ts` | 抄 `export async function GET(req: Request)`；宿主校验/鉴权已在 `proxy.ts` 统一处理，路由内再做 `isFilePathAllowed` 之类业务校验 |
| 路由的服务端业务逻辑 | `lib/<feature>.ts`（kebab-case），路由文件保持薄 | `lib/worktree.ts` ← `app/api/worktrees/route.ts`；`lib/file-access.ts` 被 19 个路由引用 | 补 `lib/<feature>.test.mjs` |
| 客户端纯逻辑（无 React、无 DOM） | 优先 `lib/<feature>.ts`（被两个以上组件用）；只服务单个组件时放 `components/<feature>.ts` | 跨组件：`lib/file-viewer-state.ts`、`lib/chat-scroll-position.ts`；单组件：`components/terminal-tab-state.ts` ← 只被 `AppShell.tsx` 用 | 测试同目录同前缀 |
| 有状态的 React 逻辑（订阅/browser API/timer） | `hooks/use<Thing>.ts`，首行 `"use client"` | `hooks/useAgentSession.ts`、`hooks/useViewportHeight.ts`、`hooks/useFileIndex.ts` | 把可判定的纯函数一并 `export`（如 `shouldUseVisualViewportHeight`）供测试直接调用 |
| UI 原子组件 | `components/<PascalCase>.tsx`，具名导出，不新建子目录 | `components/PathText.tsx`、`components/ThinkingIcon.tsx`、`components/ThemeIcon.tsx` | 若含样式，同目录 `<Name>.module.css`（现状仅 1 例） |
| Context + Provider | `components/<Thing>Context.tsx`，同文件导出 `XProvider` 与 `useXContext()` | `components/FileIndexContext.tsx:14`（`FileIndexProvider` + `useFileIndexContext`） | — |
| 共享类型（前后端都要的） | `lib/api-types.ts`（API DTO，18 处引用）、`lib/types.ts`（领域模型，46 个 export）、`lib/pi-types.ts`（pi SDK 的结构化类型，仅 3 处 import） | `import type { SessionInfo } from "@/lib/types"` | 只用 `import type`，不要引入运行时 |
| i18n 文案 | 在 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 三份 `messages` 里加 **同名 key**，命名 `<namespace>.<camelCaseLeaf>` | key 总数各 740；namespace 分布：`chat` 137、`sidebar` 61、`models` 50、`settings` 48、`agents` 38… | **三份都必须加**：`lib/i18n/registry.test.mjs` 断言三者 key 集合与占位符完全一致，漏一份即测试失败；组件里用 `const { t } = useI18n()`（`hooks/useI18n.tsx`） |
| 新增一种语言 | `lib/i18n/messages/<bcp47>.ts` + 在 `lib/i18n/registry.ts` 的 `localePlugins` 注册 | `registry.ts` 中 `[enLocale, zhCNLocale, zhTWLocale]` | 同步更新 `lib/i18n/registry.test.mjs` 的 `getSupportedLocales()` 断言；`docs/i18n.md` §Adding a language |
| 一次性本地脚本 | `e2e/<probe>.mjs`（浏览器探针）或 `scripts/<name>.sh`（发布类） | `e2e/themes.mjs`（注释写明 `node e2e/themes.mjs`）、`scripts/release-npm.sh` | 若要进 CI，必须挂进 `package.json` scripts（见 §6） |
| 架构决策记录 | `docs/adr/<NNNN>-<kebab-slug>.md` | `docs/adr/0002-chat-only-tool-selection.md` | 序号递增，4 位补零 |
| 新的服务端原生依赖 | 加进 `next.config.ts` 的 `serverExternalPackages` | 现有 `node-pty`、`undici`、`web-push`、4 个 `@earendil-works/*` | 否则 Turbopack/构建会把原生包打进 bundle |
| 组件级新样式 | `components/<Name>.module.css` + `import styles from "./<Name>.module.css"` | `components/ChatMinimap.tsx:15` | 不要新增全局 css（全局只有 `app/globals.css`、`app/settings.css`） |

**明确"不要"做的**（有实测依据）：
- 不要建 `src/`、不要建 `components/<Feature>/` 子目录（全仓库 `components/` 是平的）。
- 不要建 `lib/<feature>/index.ts`（唯一先例 `lib/ask-user/` 是既有子系统，新模块默认单文件）。
- 不要放 `tests/` 目录、不要引入 jest/vitest/testing-library（`package.json` 无这些依赖，测试命令是 `node --test`）。
- 不要把 node-only 逻辑放进 `components/`（实测 0 例；仅 2 个 `*.test.mjs` 因读源码而 import `node:fs`）。

---

## 4. 客户端与服务端边界

### 4.1 只跑在服务端的目录

- `app/api/**`：57 个 `route.ts`，全部服务端。`app/` 下目前**没有任何非路由的服务端 helper 文件**（`find app/api -type f ! -name route.ts` 的结果全是 `*.test.mjs`）→ 业务逻辑一律外置到 `lib/`。
- `lib/` 是混合目录，**不能整目录当作服务端**。实测 38 个 `lib/*.ts` import node 内建模块（`fs/path/os/child_process/url/crypto/net/http/https/stream/util/readline/worker_threads` 等）：

```text
ask-user-settings atomic-file attachment-paths bash-output directory-browser extension-ui-settings
file-access file-dirent file-upload git-changes http-dispatcher model-discovery-auth models-config-store
npx path-security paths plugin-updates powershell-settings project-command-env project-identity
provider-credential-store request-security rpc-manager session-list-cache session-path session-reader
session-search skill-lock skill-updates subagent-input subagent-runtime subagent-settings subagents
terminal-manager text-preview web-auth web-push worktree
```

- 其余 `lib/*.ts`（约 89 个）是纯逻辑/共享类型，可被客户端直接 import。
- 服务端边界**没有** `import "server-only"` 之类的守卫（实测 0 处），靠约定 + `"use client"` 反向约束。

### 4.2 `"use client"` 规则（实测）

- 共 49 个文件带 `"use client"`：`components/` 37、`hooks/` 11、`app/login/page.tsx` 1。
- 48/49 的首行就是 `"use client";`（另一个是 `app/login/page.tsx`，字段位置不同）。
- `hooks/` **全部 11 个文件都带**，没有"纯 hook 不带"的先例 → 新 hook 默认加。
- `components/` 只有 42 个 `.tsx` 中的 37 个带；不带的是无状态展示组件（见 §2 补充），可被客户端组件引入并一起进入 client bundle。

### 4.3 客户端复用服务端模块 = 只 `import type`

客户端 import `lib` 的语句中 74 条是值导入、44 条是 `import type`。其中 3 个模块**同时**被客户端和路由引用、**同时**含 node 内建 import，客户端侧全部只用类型：

| 模块 | node import | 客户端引用方式 |
|---|---|---|
| `lib/session-search.ts` | `node:fs`、`node:readline` | `components/SessionSearch.tsx:7` `import type { SessionSearchResponse }` |
| `lib/subagents.ts` | `fs`、`path` | `components/AgentsConfig.tsx:10` `import type { SubagentProfile, SubagentScope, SubagentWritableScope }` |
| `lib/terminal-manager.ts` | `os` | `components/TerminalPanel.tsx:8` `import type { TerminalEvent }` |

另有一个更严格的同族约定写在 `AGENTS.md`（Windows 路径）："Browser code cannot apply Node path rules" —— `lib/paths.ts`（含 node）的能力必须在服务端预先解析（如 `/api/worktrees` 返回已解析的 `currentWorktreePath`），客户端不得自行用 node 风格比较。

### 4.4 已存在的"core + wrapper"拆分清单（§4 要求枚举全部）

用"文件名是另一个文件名的前缀"扫全仓库，共 4 组：

| 纯/基础半 | 带 I/O 或运行时的一半 | 说明（来自文件内注释/引用关系） |
|---|---|---|
| `lib/session-file-references-core.ts` | `lib/session-file-references.ts` | core 导出 `isFilePathReferencedByEntries` / `isBashOutputPathReferencedByEntries` / `isValidSessionId`（纯判定）；wrapper 加 `resolveSessionPath` + `getSessionEntries`（fs）并 re-export core |
| `lib/provider-listing.ts` | `lib/provider-listing-runtime.ts` | 前者纯 helper 判成员资格；后者把 `ModelRuntime` 适配成前者输入（`app/api/auth/providers/route.ts:3` 只引用 runtime） |
| `lib/provider-usage.ts` | `lib/provider-usage-ids.ts` | id 解析归一（纯） |
| `lib/model-discovery.ts` | `lib/model-discovery-auth.ts` | 认证解析（`app/api/models-config/discover/route.ts:2`） |

反向命名的"纯逻辑外提以便测试"还有一类（不叫 `-core`，而是把纯函数单独成文件）：`lib/file-index-paths.ts`（文件头注释明确写 "Kept free of git/fs so it can be unit-tested without spawning a process"，唯一引用者 `app/api/file-index/route.ts:13`）、`components/models-config-helpers.ts`（只被 `ModelsConfig.tsx` 与其测试引用）。

> 写 spec 时值得把这条提炼成规则：**"需要 fs/git/child_process 的模块，把可判定的部分拆到不 import node 的 `<name>-core.ts`（或 `<name>-paths.ts`），wrapper 只做 I/O 与 re-export"**，这样单元测试不需要 mock 文件系统。

---

## 5. 路径别名与构建

### 5.1 `@/` 别名

`tsconfig.json`：

```json
"moduleResolution": "bundler",
"paths": { "@/*": ["./*"] },
"target": "ES2017", "strict": true, "noEmit": true, "allowJs": true, "jsx": "react-jsx"
```

`@/*` 映射到**仓库根**（不是 `src/`，也不是 `lib/`）。实测使用量：

| 形式 | 次数 | 说明 |
|---|---|---|
| `@/lib/...` | 306 | 跨目录引用 lib 的主流写法 |
| `@/hooks/...` | 50 | |
| `@/components/...` | 3 | 少；`app/` 引组件主要就是这 2–3 处 |
| `./...`（同目录） | 200 | 同目录内一律相对路径，例：`components/AppShell.tsx:11` `import { openFileTab, saveFileViewerState } from "./file-tab-state"` |
| `../...`（跨目录相对） | **5** | 全部在 `lib/` 子目录内：`lib/ask-user/persist.ts`、`lib/ask-user/extension.ts`、`lib/i18n/messages/{en,zh-CN,zh-TW}.ts` |

→ 规则可写成：**跨目录一律 `@/`，同目录用 `./`；`../` 只允许出现在 `lib/` 的子目录中**（因为 `@/lib/ask-user/...` 从子目录写起来更啰嗦，现状选择相对）。

### 5.2 `tsconfig.json` 的 include/exclude 边界

`include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"]`
→ **`*.test.mjs` 与 `e2e/*.mjs` 不参与 tsc 类型检查**（`allowJs` 为 true 但它们不在 include 里），`.mjs` 的正确性只靠运行时测试。`tsconfig.tsbuildinfo` 被 gitignore。

### 5.3 `next.config.ts` 中值得写进规范的设置

| 设置 | 值/原因 |
|---|---|
| `serverExternalPackages` | `node-pty`、`undici`、`web-push`、4 个 `@earendil-works/*`。**新增服务端原生/免打包依赖必须加这里** |
| `images.unoptimized: true` | 只用 next/image 渲静态 logo，刻意关掉 `/_next/image` 优化器（安全面） |
| `outputFileTracingRoot: configDir` | 打包追踪根 |
| `allowedDevOrigins` | Next 16 默认拦跨源 dev 资源；这里开了 loopback + RFC1918 段（`10.*`、`172.16–31.*`、`192.168.*`） |
| `headers()` | `/` 强制 `private, no-cache`；`/sw.js` 用 `Service-Worker-Allowed: /`；`/manifest.webmanifest` 不缓存 |
| `env` | 注入 `NEXT_PUBLIC_APP_VERSION`（来自 `package.json`）、`NEXT_PUBLIC_PI_VERSION`（来自 `node_modules/@earendil-works/pi-coding-agent/package.json`） |

`eslint.config.mjs` 要点：使用 `eslint-config-next` 的 `core-web-vitals` + `typescript` 两套 flat config，**ignore `.agents/**`、`.pi/**`、`.trellis/**`**，并关掉三条规则：`react-hooks/immutability`、`react-hooks/refs`、`react-hooks/set-state-in-effect`（写 spec 的 quality 文档时要注意，代码里依赖这些关闭）。

样式链路：`tailwindcss@4` + `@tailwindcss/postcss`，`app/globals.css` 首行 `@import "tailwindcss"` 与 `@import "@xterm/xterm/css/xterm.css"`，另有 `@font-face` 自托管 Cascadia Code（`public/fonts/`）。`tailwind.config.ts` 的 `content` 只列了 `pages/ components/ app/`（`lib/`、`hooks/` 未列，是现状）。

---

## 6. `e2e/` 与脚本约定

### 6.1 两类脚本（重要区别，写 spec 时别混）

**A. 进 CI 的 harness 脚本**（`package.json` 只挂了 3 个）：

| npm script | 命令 | 覆盖 |
|---|---|---|
| `test:terminal` | `node e2e/terminal.mjs` | 终端面板（自带 dev server 启停） |
| `test:e2e` | `node e2e/run.mjs && node e2e/subagents.mjs` | 主回归 + Trellis 子代理回归 |
| `test:e2e:subagents` | `node e2e/subagents.mjs` | 只跑后者 |

结构上：`e2e/run.mjs`（21.3KB）是编排器，自己起停 Turbopack dev server（或用 `E2E_SERVER_MODE=start` 对 `next start`），并 `import { checkExtensionDialogs, extensionSource } from "./extension-dialog.mjs"`、`import { checkChatAppearance } from "./chat-appearance.mjs"`。也就是说：

> **约定：可复用的特性检查写成 `e2e/<feature>.mjs` 并 `export async function check<Feature>(page, artifacts, width)`；由 `run.mjs` import 组装；独立整套回归（`subagents.mjs`、`terminal.mjs`）则保持"自包含单文件 + 自己的 npm script"。**

`e2e/subagents.mjs`（31.7KB）和 `e2e/terminal.mjs` 是自包含的单文件脚本，不 export，自己 `spawn` server、自建 `PI_CODING_AGENT_DIR` 临时 fixture、自己 `chromium.launch()`。

**B. 本地一次性探针脚本**（不在 `package.json` 里）：

- `e2e/themes.mjs` — 头部注释 `// Run against an existing dev server: node e2e/themes.mjs`，base 从 `E2E_BASE_URL` 取，默认 `http://127.0.0.1:30141`。
- `e2e/clickable-file-paths.mjs` — 头部注释 `// Read-only browser regression against an existing real session. No model calls or session writes.`，base 默认一个内网地址 `http://192.168.11.47:8505`，产物写到某个 task 的 research 目录。

→ 这两类都要写进 Layout 说明，并提示：**新增 CI 回归要挂 `package.json`；纯本地探针用 `<feature>.mjs` + 顶部注释写清运行方式**。

### 6.2 `.mjs` 与测试命令

- 单元测试命令：`node --experimental-strip-types --test "app/**/*.test.mjs" "components/**/*.test.mjs" "hooks/**/*.test.mjs" "lib/**/*.test.mjs" "public/**/*.test.mjs"` —— **glob 只覆盖这 5 个目录**：新测试文件放在别处不会被 `npm test` 跑到。
- `e2e/*.mjs` 不在 `npm test` 里，靠 `test:e2e` / `test:terminal`。
- 测试加载 `.ts`/`.tsx` 有两种既有写法：纯 `.ts` 用 `jiti`（常见，99 个文件用 `createJiti`）或 `await import("./x.ts")`（Node strip-types，109 个文件有动态 `.ts` import）；`.tsx` 一律 `jiti` 且需要 `{ jsx: { runtime: "automatic" }, tsconfigPaths: true }`（`components/ChatInput.test.mjs:10`）。组件无 jsdom：用 `react-dom/server` 的 `renderToStaticMarkup`，或直接读源码做文本断言（43 个组件测试中有 32 个读 `.tsx` 源文本）。
- `lib/*.test.mjs` 也用于测仓库根文件：`lib/pi-web-options.test.mjs` 用 `spawnSync` 跑 `bin/pi-web-options.js`，`lib/process-lifecycle.test.mjs` 直接 `import "../bin/process-lifecycle.js"`，`lib/node-version.test.mjs` `require("../package.json")`，`lib/next-config.test.mjs` 校验 `next.config.ts`。→ **同名测试允许测"同目录之外的对应实现"，但文件仍放在 `lib/`。**
- `lib/written-file-sources.check.test.mjs` 是唯一的 `.check.test.mjs` 变体（描述性强校验），不是通用约定。

### 6.3 `package.json` scripts 全表（命名习惯）

| script | 实际内容 | 类别 |
|---|---|---|
| `postinstall` | `node bin/prepare-terminal.js` | 安装钩子（修 node-pty 可执行位） |
| `dev` / `dev:lan` | `next dev -H 127.0.0.1|0.0.0.0 -p 30141` | 开发（端口固定 30141） |
| `build` | `next build --webpack` | 构建（`AGENTS.md` 禁止开发期跑） |
| `start` / `start:lan` | `next start -H … -p 30141` | 生产启动 |
| `lint` | `eslint .` | 检查 |
| `test` | `node --experimental-strip-types --test <5 个 glob>` | 单元测试 |
| `test:terminal`, `test:e2e`, `test:e2e:subagents` | 见 §6.1 | e2e |
| `release` | `npm version patch --no-git-tag-version && npm run build && npm publish --access public` | 发布 |

命名习惯：**冒号分层 `<类别>:<子集>`**（`test:e2e:subagents`、`start:lan`）；发布另有 shell 包装 `scripts/release-npm.sh`、`scripts/release-personal.sh`（受 `.github/workflows/release-personal.yml` 触发）。

`bin/` 约定：CommonJS（`"use strict"` + `require`，因此文件内有 `// eslint-disable-next-line @typescript-eslint/no-require-imports`），`pi-web.js` 是 `package.json` `bin` 入口，`node-version.js` / `pi-web-options.js` / `process-lifecycle.js` 被入口拆分出来并被 `lib/*.test.mjs` 覆盖，`prepare-terminal.js` 是 postinstall 专用。

---

## 7. 对 `directory-structure.md` 模板 section 的处置建议

模板现有 5 个 section，建议：

| 模板 section | 处置 | 理由 |
|---|---|---|
| `## Overview` | **改名 + 保留**：`## Overview`（写"本仓库没有 `src/`；源码在仓库根"这一句最关键） | 现有 `README.md` 已有段落式描述，spec 需明确纠正 `src/` 误解 |
| `## Directory Layout` | **保留并替换代码块**为 §1.2 的真实树（顶层 + 二级，带文件数） | 模板树是 `src/` + `...`，与仓库 100% 不符 |
| `## Module Organization` | **改名 + 重写**为 `## Where New Code Goes`（或中文标题），内容 = §3 决策表 | "Module Organization" 在本项目会诱导出"按 feature 建目录"的推论，而实际是**按技术层扁平组织**；决策表才是 sub-agent 真正需要的 |
| `## Naming Conventions` | **保留并替换**为 §2 表格（含占比与"不要做"） | 现有 4/4 空 |
| `## Examples` | **保留但改写**为"该抄的范例 + 该避免的反例" | 建议列出：API 薄路由 `app/api/worktrees/route.ts`；纯逻辑外提 `lib/file-index-paths.ts` + `app/api/file-index/route.ts`；core/wrapper `lib/session-file-references-core.ts` ↔ `lib/session-file-references.ts`；组件 + 纯逻辑 + 测试三件套 `components/AppShell.tsx`/`components/file-tab-state.ts`/`components/AppShell.terminal.test.mjs`；hook 导出纯函数 `hooks/useViewportHeight.ts` |

建议**新增 2 个 section**（模板没有，但 sub-agent 高频踩坑处）：

1. `## Client And Server Boundary`：`"use client"` 规则、`lib/` 的混合性、`import type` 规则、4 组 core/wrapper 拆分。
2. `## Path Aliases And Build`：`@/` ↔ `./` ↔ `../` 的取舍、`next.config.ts` 的 `serverExternalPackages` 等硬要求、`npm test` 的 glob 边界、`*.test.mjs` 不进 tsc。

另外要把 `README.md` 的 `## Repository Layout` 作为交叉引用放进 Overview，避免两份描述漂移（现状两份说法一致，可保持）。

---

## 8. 未决/待确认（不要写成规则）

1. `components/` 是平目录没有例外，但 `ChatInput.tsx`(3005 行)、`SessionSidebar.tsx`(2700 行)、`AppShell.tsx`(2520 行)、`ModelsConfig.tsx`(2170 行) 已明显过大 —— 团队是否接受继续往平目录加"巨型组件"需要人确认；spec 只能写现状，不宜写"允许无限增长"。
2. `tailwind.config.ts` 的 `content` 未包含 `hooks/`、`lib/`（这两处可能有类名字符串）；不确定是刻意还是遗留。
3. `e2e/clickable-file-paths.mjs` 与 `e2e/themes.mjs` 是个人探针（硬编码内网 IP / 写到某个 task 目录），是否要保留在 `e2e/` 需要人决定；spec 现在只能如实描述两类脚本并存。
4. `lib/i18n/messages/en.ts` 等文件里注释是中文，`docs/i18n.md` 与 `.trellis/spec/frontend/index.md` 声明文档用英文，产品代码注释语言不统一（既有中文也有英文）——建议由 `type-safety.md`/`quality-guidelines.md` 决定，不要在本文件定规则。
5. `lib/` 中 127 个顶级 `.ts` 里 20 个没有同名测试（`allowed-roots`、`api-types`、`types`、`pi-types`、`clipboard`、`npx`、`path-security`、`skills-service`、`push-client`、`terminal-client` 等）；这些是类型/纯转发/被间接覆盖的模块，"是否必须配测试"需要人确认阈值。

---

## 附：本次调研的原始证据命令（可复现）

```bash
# 规模
for d in app components hooks lib e2e bin scripts docs public; do \
  printf "%-12s %s\n" "$d" "$(find $d -type f | wc -l)"; done

# 命名
ls components/*.tsx | wc -l                        # 42
for f in lib/*.ts; do case $(basename $f) in *[A-Z]*) echo "$f";; esac; done   # 空
for f in hooks/*; do grep -q '"use client"' $f && echo $f; done | wc -l         # 11
find app components hooks lib public -name "*.test.mjs" | wc -l                # 198

# 边界
grep -rlE 'from "(node:)?(fs|path|os|child_process|url|crypto)"' lib/*.ts | wc -l   # 38
grep -rho 'from "@/[^"]*"' app components hooks lib --include=*.ts --include=*.tsx | wc -l  # 359
grep -rho 'from "\.\./[^"]*"' app components hooks lib --include=*.ts --include=*.tsx | wc -l # 5

# core/wrapper
for f in lib/*.ts components/*.ts; do b=$(basename $f .ts); \
  for g in lib/*.ts components/*.ts; do c=$(basename $g .ts); \
    [ "$b" != "$c" ] && [[ "$c" == "$b"* ]] && echo "$f -> $g"; done; done | sort -u
```
