# 类型安全与质量门禁调研（`type-safety.md` + `quality-guidelines.md` 语料）

- 调研时间：2026-09-19
- 仓库快照：`git log -1` → `3567be5 chore(task): drop the duplicate archived bootstrap-guidelines copy`
- 本机 Node：`v26.1.0`（`package.json` engines 要求 `>=22.19.0`，CI 固定 `22.19.0`）
- 只读调研。唯一写入的文件就是本文件。
- **不重复**已有 research：
  - 组件/props/样式惯例 → `research/component-conventions.md`
  - 目录/命名/`e2e` 脚本分类/hook 测试两套风格 → `research/directory-layout.md`（§6）、`research/hooks-and-state.md`（§1.3）
  - 本文件专攻：TS 严格度、类型写法、边界守卫、ESLint 实际规则集、测试加载机制、门禁基线与硬约束。

---

## 0. 结论速览（可直接落 spec 的硬事实）

| 事实 | 证据 |
|------|------|
| TS 只有 `strict: true` + `isolatedModules: true` + `skipLibCheck: true`；**没有** `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax` | `tsconfig.json:9-16` |
| 全仓库 `any` 出现 **0 次**（含 `as any` / `<any>` / `: any`），`@ts-expect-error` **0 次**，非空断言 `!` **0 次**，`enum` **0 次** | §3.5 的命令输出 |
| `interface` 328 处 vs `type X = ...` 248 处；对象形状用 `interface`，联合/字面量/工具类型派生用 `type` | §2.1 |
| props 类型：16 个文件用文件私有 `interface Props`，11 个用 `interface <Name>Props`，其余用内联对象字面量类型 | §2.2 |
| 边界解码统一手写 `isRecord(value: unknown): value is Record<string, unknown>`，且**每个模块各自复制一份**（11 个文件）+ `isObject` 变体（5 个文件），**没有共享 type-guard 模块** | §3.1 |
| 没有任何 schema 校验库（无 zod/yup/io-ts/valibot/ajv/superstruct） | `package.json` dependencies/devDependencies |
| ESLint 是 **Next 两个 flat preset + 3 条 `off`**，**不是 type-aware lint**（`parserOptions` 无 `project`/`projectService`） | `eslint.config.mjs:1-17`，`eslint --print-config` |
| `eslint .` 当前：**474 个文件，0 error / 0 warning，约 45s** | §4.5 |
| `tsc --noEmit` 当前：**0 错，约 10.5s**（有 `tsconfig.tsbuildinfo` 增量） | §6.2 |
| `npm test` 当前：**1311 tests / 1311 pass / 0 fail，约 74s**（`node --experimental-strip-types --test`） | §6.2 |
| `.ts`/`.tsx` 在单测里靠 `jiti`（`createJiti(import.meta.url, …)` 116 个文件命中）或 `await import("./x.ts")` 加载；**没有 jsdom**，组件要么 `renderToStaticMarkup`（11 个）要么读源码文本（31 个组件测试） | §5.1、§5.3 |
| 三语（en / zh-CN / zh-TW）key 与占位符一致性由 `lib/i18n/registry.test.mjs:39-54` 强制 | §5.4 |
| 全部既有 `eslint-disable` 只有 4 类、16 处，且都带具体理由 | §4.3 |

---

## 1. TS 严格度

### 1.1 `tsconfig.json` 实际开关（逐行）

```jsonc
// tsconfig.json
"lib": ["dom", "dom.iterable", "esnext"],   // :3-7
"allowJs": true,                            // :8
"skipLibCheck": true,                       // :9   ← 不检查 node_modules 里的 .d.ts
"strict": true,                             // :10  ← 唯一的总开关
"noEmit": true,                             // :11
"esModuleInterop": true,                    // :12
"module": "esnext",                         // :13
"moduleResolution": "bundler",               // :14
"resolveJsonModule": true,                  // :15
"isolatedModules": true,                    // :16
"jsx": "react-jsx",                         // :17
"incremental": true,                        // :18
"paths": { "@/*": ["./*"] },                // :24-28
"target": "ES2017"                          // :29
```

**未启用**（已用 `grep -n "noUncheckedIndexedAccess\|exactOptionalPropertyTypes\|verbatimModuleSyntax" tsconfig.json .trellis` 确认，0 命中）：
`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`noImplicitOverride`、
`noPropertyAccessFromIndexSignature`、`noFallthroughCasesInSwitch`、`noUnusedLocals`/`noUnusedParameters`（未用变量交给 ESLint）。

`skipLibCheck: true` 是一条**明确的宽松妥协**：pi SDK 的 `.d.ts` 不做全量检查，所以 `lib/pi-types.ts` 里的结构类型是唯一校验点（见 §3.3）。

### 1.2 各开关在代码中留下的可见痕迹

| 开关 | 代码痕迹（实证） |
|------|------------------|
| `strict: true` | 全仓 0 个 `any`、0 个 `@ts-expect-error`、0 个非空断言；所有边界都靠 `unknown` + 类型守卫（§3.1）。`eslint --print-config` 里 `@typescript-eslint/no-explicit-any` 仍是 `error`，属于双重兜底 |
| `isolatedModules: true` | 大量 `import type` / `export type`：93 个文件、135 行 `import type`；`export type` 76 处。**但**因为没有开 `verbatimModuleSyntax`，这是约定而非编译器强制（`tsc` 不会因为漏写 `type` 报错） |
| `moduleResolution: "bundler"` | 全仓 import 不写 `.js` 后缀；`@/` 别名同时被 `jiti` 的 `tsconfigPaths: true` 与 `eslint-plugin-import` 解析 |
| `jsx: "react-jsx"` | `.tsx` 无 `import React`（只有用 `React.CSSProperties` 等命名空间时才 import）。测试侧必须镜像这个设置：`createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true })`（`components/ChatInput.test.mjs:10`） |
| `skipLibCheck: true` | SDK 类型冲突不会在 `tsc` 里爆；`lib/pi-types.ts` 用手写结构类型把 SDK 面收窄（§3.3） |
| `incremental: true` | 根目录存在 `tsconfig.tsbuildinfo`（529 KB）；本地 `tsc --noEmit` 因此约 10.5s |

### 1.3 未启用开关造成的既成事实（spec 必须照实写，不能写成理想）

1. **`noUncheckedIndexedAccess` 关** → 数组下标访问的类型是 `T` 而不是 `T | undefined`，所以**代码里普遍不写下标判空**，判空只出现在真正需要的地方。最典型的是正则捕获组：

   ```ts
   // lib/written-file-sources.ts:139-143
   const change = SUMMARY_ADD_UPDATE_RE.exec(line);
   if (change) {
     files.set(change[2].trim(), {
       filePath: change[2].trim(),
       operation: change[1] as WrittenFileOperation,  // ← 组索引是 string，需显式窄化
   ```

   改这一条属于**全仓级行为变更**，会出现成百上千条新报错，不是可以顺手加的东西。

2. **`exactOptionalPropertyTypes` 关** → `foo?: T` 允许显式写 `foo: undefined`，全仓有 **11 处**直接这么写，例如：

   ```ts
   // lib/rpc-manager.ts:1306-1307
   widgetLines: undefined,
   widgetPlacement: undefined,
   // lib/subagent-runtime.ts:465-467
   completedAt: undefined,
   result: undefined,
   error: undefined,
   // lib/trellis-subagent-records.ts:668
   errorExcerpt: undefined,
   ```

   反过来，全仓 **0 处**写 `foo?: T | undefined`（`grep -c "?: .*| undefined"` → 0）。也就是说：可选字段只写 `?`，需要「显式重置」时直接赋 `undefined`。

3. **`verbatimModuleSyntax` 关** → `import type` / `export type` 靠人工习惯维持（§2.1 末）。

4. **没有 `noUnusedLocals` / `noUnusedParameters`** → 未使用变量由 ESLint 的 `@typescript-eslint/no-unused-vars`（warn）负责。

---

## 2. 类型写法惯例

### 2.1 `interface` vs `type`：328 : 248，且有清晰分工

```
$ grep -rn "^\s*\(export \)\?interface " --include="*.ts" --include="*.tsx" lib components hooks app | wc -l
328
$ grep -rn "^\s*\(export \)\?type [A-Z]" --include="*.ts" --include="*.tsx" lib components hooks app | wc -l
248
```

**`interface` = 对象形状**（占绝对多数）：

```ts
// lib/types.ts:3-10
export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}
```

**`type` = 联合 / 字面量联合 / 工具类型派生 / 函数类型**。实测 `export type X =` 跨行定义中 **23 处是联合**、2 处是对象别名：

```ts
// lib/written-file-sources.ts:31-37 —— 最常被引用的字面量联合
export type WrittenFileOperation = "add" | "update" | "move" | "write" | "edit";
export type WrittenFileOrigin =
  | "tool-input"
  | "apply-patch-details"
  | "apply-patch-text"
  | "subagent-trellis"
  | "subagent-snapshot";

// lib/types.ts:50 —— 判别联合
export type AssistantContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

// lib/agent-event-wire.ts:20-25 —— 工具类型派生 + 交叉
export type ClientAssistantMessageEvent =
  | Exclude<JsonAssistantMessageEvent, { type: "toolcall_start" | "toolcall_delta" }>
  | (JsonToolCallStartEvent & { id?: string; toolName?: string });

// lib/i18n/types.ts:2 —— 编译期安全的 locale 白名单
export type Locale = "en" | "zh-CN" | "zh-TW";

// lib/git-types.ts:1-7
export type GitFileStatusKind =
  | "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflict";
```

**枚举一律不用**（`grep -c "^export enum\|^enum "` → **0**）：用 `type X = "a" | "b"` + `const SET = new Set<X>([...])` 做运行时校验，例如：

```ts
// lib/written-file-sources.ts:31,39-45
export type WrittenFileOperation = "add" | "update" | "move" | "write" | "edit";
const WRITTEN_FILE_OPERATIONS = new Set<WrittenFileOperation>([
  "add", "update", "move", "write", "edit",
]);
// 使用点（先校验再断言）
// lib/written-file-sources.ts:338-339
WRITTEN_FILE_OPERATIONS.has(raw.operation as WrittenFileOperation)
  ? raw.operation as WrittenFileOperation
```

同型还有 `lib/theme.ts:13 isThemePreference(value: unknown): value is ThemePreference`、
`lib/tool-presets.ts:19 isToolPreset(value: unknown): value is ToolPreset`、
`lib/settings-navigation.ts:34 isSettingsSection(value: unknown): value is SettingsSection`。

**`import type` / `export type` 习惯**：
- 纯类型 import 写 `import type { ... } from "..."`；混在一起时用内联 `type`：`import { AGENT_TOOL_NAME, type RawWrittenFile, type WrittenFile } from "./written-file-sources";`（`lib/turn-written-files.ts:4-12`）。
- 转发类型用 `export type { A, B } from "./x";`（`lib/turn-written-files.ts:14-18`）。
- **不要**为了同目录模块省掉 type 关键字（`isolatedModules` 下转发类型必须显式）。

### 2.2 props 类型命名（本文件只做汇总，细节见 `component-conventions.md` §1.4）

| 写法 | 数量 | 代表 |
|------|------|------|
| 文件私有 `interface Props { ... }` | 16 | `components/ChatWindow.tsx:40`、`components/ChatInput.tsx:57`、`components/FileViewer.tsx:38`、`components/MessageView.tsx:211`、`components/SessionSidebar.tsx:106` |
| `interface <Name>Props` | 11 | `components/PathText.tsx:8`（**export**）、`components/MarkdownBody.tsx:13`、`components/MermaidBlock.tsx:11`（另 `:252 CodeBlockProps`）、`components/ModelSelector.tsx:13`（**export 供父级复用**）、`components/SettingsUi.tsx:8 ConfigPanelShellProps` |
| 内联对象字面量类型（直接写在参数位置） | 63 个导出函数中的多数 | `components/SettingsUi.tsx:72` `{ children }: { children: ReactNode }`；`components/TurnWrittenFiles.tsx:55` 直接内联 3 个字段 |

判据（从代码里能读出来的）：
- 只有本文件用 → 私有 `interface Props`（不导出，避免污染公共面）。
- 需要被父级/兄弟组件引用或该文件导出多个组件 → `interface <Name>Props` 且 `export`。
- 单字段薄包装/工具组件 → 内联字面量类型，不为一个 `children` 开 interface。

### 2.3 可选字段：`?` 还是 `| null`

**实测比例**：对象字面量里 `foo?: T` 形式的可选字段 **400 处**；`foo: T | null` **50 处**；`foo?: T | undefined` **0 处**。

判别依据（从数据来源反推，是一条稳定规律）：

**用 `?`（字段本身可以不存在）**——可选配置、可选元数据、可选响应字段：

```ts
// lib/written-file-sources.ts:44-62
export interface WrittenFile {
  filePath: string;                 // 必填
  operation?: WrittenFileOperation; // 来源不一定能给出 operation
  added?: number;                   // 只有能证明归属时才给
  removed?: number;
  sourceSessionId?: string;         // 只有内置 Agent 快照才带
  origin?: WrittenFileOrigin;
}

// lib/git-types.ts:26-30
export interface GitFileDiffResponse {
  supported: boolean;
  status?: GitFileStatusKind;
  patch?: string;
}

// lib/pi-types.ts:34-40
export interface ToolInfo {
  name: string;
  description: string;
  parameters?: unknown;
  promptGuidelines?: string[];
  sourceInfo?: unknown;
}
```

**用 `| null`（字段一定存在，但值是「无」）**——JSON / git / 存储的显式 `null`、以及「查过了，没有」的语义：

```ts
// lib/types.ts:14-15 —— pi session 文件里 parentId 是显式 null（根条目）
export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

// lib/types.ts:419
oldestEntryId: string | null;

// lib/git-types.ts:20-24 —— git 在非仓库时返回 null 而不是省略字段
export interface GitStatusResponse {
  isGitRepository: boolean;
  repositoryRoot: string | null;
  files: GitFileStatus[];
  additions: number;
  deletions: number;
}

// lib/pi-types.ts:15-19 —— SDK 的用量统计显式给 null
export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}
```

一句话判据：**「文件/协议里会写 `null`」→ `| null`；「我们这边可以不给」→ `?`；两者都源于同一句实证——`getItem(): string | null` 是全仓 5 个 storage 接口的统一签名（`lib/workspace-memory.ts:18`、`lib/file-explorer-state.ts:4`、`lib/settings-navigation.ts:16`、`lib/tool-preset-preference.ts:6`），因为 `localStorage.getItem` 的 DOM 类型就是 `string | null`**，该类型被原样透传。

### 2.4 导出类型集中放哪

| 位置 | 承载什么 | 引用者 |
|------|----------|--------|
| `lib/types.ts`（440 行 / 46 个导出类型） | **pi session 文件格式**的镜像类型（`SessionHeader`、`SessionEntryBase`、`AssistantContentBlock`、`SessionContext`…）；文件头注释写着 `// Types mirrored from pi-mono coding-agent session-manager` | 42 个文件 |
| `lib/api-types.ts`（24 个导出类型） | **HTTP API 契约**（`PluginsResponse`、`SkillsResponse`、`SubagentProfilesResponse`、`PluginScope`…） | 20+ 文件（含 `app/api/*/route.ts`） |
| `lib/git-types.ts`（4 个导出类型） | `GitFileStatusKind` / `GitFileStatus` / `GitStatusResponse` / `GitFileDiffResponse` | `lib/git-status.ts`、`lib/git-changes.ts`、`lib/worktree.ts` |
| `lib/pi-types.ts`（205 行） | **SDK 的结构化类型**（§3.3） | `lib/rpc-manager.ts`、`lib/subagent-runtime.ts`、`hooks/useAgentSession.ts` |
| `lib/file-types.ts` | 文件预览常量 + `DocumentPreviewKind` | `lib/file-*.ts`、`app/api/files/*` |
| 模块本地 `export interface/type` | 其余全部（`lib/` 有 **78 个文件**自己导出类型） | 就近使用 |

统计口径：`lib/` 258 个类型导出（140 个文件）、`components/` 15 个、`hooks/` 15 个、**`app/` 0 个**。

结论（可直接落 spec）：**没有全局 `types.d.ts` 或 barrel 文件**。四种「事实上的公共类型集」（session 格式 / HTTP 契约 / git / SDK）才上提到 `lib/xxx-types.ts`；其余类型与实现同文件导出，跨模块引用走 `@/lib/...` 相对路径。

---

## 3. 边界与守卫

### 3.1 `unknown` + 运行时窄化的唯一范式：模块自带 `isRecord`

```ts
// lib/model-catalog.ts:71-73 —— 全仓出现次数最多的 4 行代码之一
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

**同名 `function isRecord` 在 11 个文件里各定义一份**（无共享模块）：

```
lib/model-catalog.ts:71
lib/model-discovery.ts:6
lib/model-discovery-auth.ts:11
lib/models-config-store.ts
lib/powershell-settings.ts:9
lib/project-tree.ts:20
lib/provider-credential-store.ts
lib/provider-usage.ts
lib/session-reader.ts
lib/subagents.ts
lib/written-file-sources.ts:79
```

**`isObject` 变体另有 5 个文件**：`lib/tool-execution-progress.ts:3`、`lib/normalize.ts:3`、`lib/trellis-subagent-history.ts`、`lib/trellis-subagent-records.ts`、`lib/agent-event-wire.ts`。全仓 `Record<string, unknown>` 出现 75 处。

把这三件事**当作既有约定**（而不是可优化点）的理由在代码里有直接证据：每个模块都是「窄接口 + 不依赖其它模块」的纯函数单元（例如 `lib/trellis-subagent-records.ts:1-11` 的模块注释明确写 "Nothing here imports the project extension, Pi persistence or React"）。抽公共 helper 会引入新的跨模块依赖。

**代表文件 1 —— `lib/model-catalog.ts:71-101`：`unknown` 输入 + 逐字段窄化 + 可选值归一**

```ts
function isRecord(value: unknown): value is Record<string, unknown> { … }
function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function optionalNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function readCost(value: unknown): ModelCatalogCost {
  if (!isRecord(value)) return {};
  return {
    input: optionalNonNegativeNumber(value.input),
    output: optionalNonNegativeNumber(value.output),
    cacheRead: optionalNonNegativeNumber(value.cache_read),
    cacheWrite: optionalNonNegativeNumber(value.cache_write),
  };
}
function readInputModalities(value: unknown): string[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.input)) return undefined;
  const input = Array.from(new Set(value.input
    .filter((entry): entry is string => typeof entry === "string")   // ← 内联类型谓词
    .map((entry) => entry.trim().toLocaleLowerCase())
    .filter((entry) => SUPPORTED_INPUT_MODALITIES.has(entry))));
  return input.length ? input : undefined;
}
```

注意两个惯用法：
- **内联类型谓词** `.filter((entry): entry is string => typeof entry === "string")`，避免 `as string[]`。
- 返回「缺失即 `undefined`」，让上层用 `?.` / `??` 兜底，而不是抛异常。

**代表文件 2 —— `lib/written-file-sources.ts:79-103, 156-232, 289-340`（最完整的 hostile-payload 解码）**

```ts
// :79
function isRecord(value: unknown): value is Record<string, unknown> { … }

// :103 —— 文本块解码
if (isRecord(block) && block.type === "text" && typeof block.text === "string") { … }

// :188 —— 解析失败返回 null，而不是抛
function parseApplyPatchResult(result: unknown): RawWrittenFile[] | null {
  if (!isRecord(result)) return null;
  …
}

// :327-339 —— 先做 Set 成员校验，再做断言
if (!isRecord(details) || details.kind !== SUBAGENT_DETAILS_KIND) return [];
…
WRITTEN_FILE_OPERATIONS.has(raw.operation as WrittenFileOperation)
  ? raw.operation as WrittenFileOperation
  : undefined
```

**代表文件 3 —— `lib/auth-throttle.ts:41-57`（`globalThis` 全局态守卫，抗热重载 + 抗脏值）**

```ts
function getGlobalState(): AuthThrottleState {
  const store = globalThis as Record<PropertyKey, unknown>;
  const key = Symbol.for(STATE_KEY);
  const existing = store[key];
  if (isState(existing)) return existing;      // ← 冷启动时可能被别的模块/版本写脏
  const created = freshState();
  store[key] = created;
  return created;
}

function isState(value: unknown): value is AuthThrottleState {
  return typeof value === "object"
    && value !== null
    && typeof (value as AuthThrottleState).failures === "number"
    && typeof (value as AuthThrottleState).lastFailureAt === "number"
    && typeof (value as AuthThrottleState).blockedUntil === "number";
}
```

同型还有 `lib/session-liveness.ts:96 isCompatibleRegistry(value: unknown): value is SessionLivenessRegistry`、
`lib/ask-user/persist.ts:51 isPersistedOpenAsk(value: unknown): value is PersistedOpenAsk`。

**边界统一写法（可写进 spec）**：外部输入（`JSON.parse`、`req.json()`、tool `details`、SDK 事件、`globalThis` 上的旧值）一律标 `unknown` → 手写守卫 → 返回 `T | null` / `T | undefined`；**不用 schema 库，不抛异常，不做类型断言兜底**。

`JSON.parse` 全仓 40 处，标准形态是 `try { JSON.parse(...) } catch { return <安全默认> }`：

```ts
// lib/models-config-store.ts:67-72
if (!existsSync(modelsPath)) return { providers: {} };
try {
  return JSON.parse(readFileSync(modelsPath, "utf8")) as Record<string, unknown>;
} catch {
  return { providers: {} };
}
```

### 3.2 `as` 断言的密度与可接受场景

| 指标 | 值 |
|------|-----|
| `as <Type>` 断言（排除 `as const`） | **272 处 / 257 个 ts/tsx 文件**（≈ 1.06 处/文件） |
| `as const` | 66 处 |
| `as unknown as` | **20 处** |
| `as` 的高频目标 | `Record`(19)、`AgentEvent`(16)、`SessionEntry`(14)、`ExtensionUiRequest`(14)、`Partial`(12)、`unknown`(11)、`Node`(10)、`ThinkingLevel`(9)、`Promise`(9)、`AssistantMessage`(7) |

**可接受场景（有明确目的、且附近有校验或结构性理由）**：

1. **regex 捕获组 → 字面量联合**（配合 Set 成员校验）：
   `lib/written-file-sources.ts:141`、`:338-339`（见 §3.1）。

2. **SDK 返回的宽类型 → 本项目的窄类型（在唯一适配层做一次）**：
   ```ts
   // lib/session-reader.ts:574
   return entries as unknown as SessionEntry[];
   // lib/rpc-manager.ts:2172-2177
   sessionManager.getEntries() as unknown as SessionEntry[],
   ```
   这类断言只允许出现在 `lib/session-reader.ts` / `lib/rpc-manager.ts` / `lib/subagent-runtime.ts` 三个适配点，共 20 处 `as unknown as` 中的 17 处。

3. **`globalThis` 上的跨模块注册表**（TS 无法表达 symbol 索引）：
   `lib/auth-throttle.ts:41`、`lib/session-liveness.ts:105,117`：
   ```ts
   const store = globalThis as Record<PropertyKey, unknown>;
   ```

4. **访问运行时可能不存在的可选内建方法**：
   ```ts
   // lib/session-liveness.ts:132
   const unref = (lease.timer as unknown as { unref?: () => void }).unref;
   // lib/rpc-manager.ts:644
   (manager as unknown as { flushed: boolean }).flushed = true;
   ```

5. **判别联合收窄后的属性访问**（在 `typeof x === "object"` 之后，对 union 的某一支取字段）：`lib/rpc-manager.ts` 中的 `AgentEvent` 断言（16 处）。

一句话：**断言必须能回答「为什么这里比编译器知道得更多」**——要么刚做过运行时校验，要么处于明确的适配边界（SDK/`globalThis`/SSE wire）。

### 3.3 对外部对象的结构化类型：`lib/pi-types.ts` 是唯一 SDK 适配面

```ts
// lib/pi-types.ts:1-13 —— 只从 SDK import 真正需要的类型
import type { AgentSessionEvent, BashOperations, SessionManager, SettingsManager, SlashCommandInfo, Theme } from "@earendil-works/pi-coding-agent";
import type { AgentLoopTurnUpdate, AgentMessage as PiAgentMessage, PrepareNextTurnContext } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
```

要点（205 行）：
- **`export interface` 的是本项目要长期依赖的窄面**：`ContextUsage`、`ModelLike`、`ToolInfo`、`NavigateTreeResult`、`SessionStatsInfo`、`ExtensionUiContextLike`、`AgentSessionLike`。
- **文件私有 `interface XxxLike`** 只服务 `AgentSessionLike` 的字段（`PromptTemplateLike`、`SkillLike`、`ResourceLoaderLike`、`ExtensionRunnerLike`、`type DialogOptionsLike`、`type WidgetOptionsLike`）——**不导出，防止外部模块绕过 `AgentSessionLike` 直接用 SDK 内部形状**。
- `as PiAgentMessage` 的重命名 import 表明 SDK 的 `AgentMessage` 与本项目的 `AgentMessage`（`lib/types.ts`）是同名不同物，**引用时必须显式区分**。
- `readonly` 与 `?:` 混合使用，忠实反映 SDK 的可选面：`readonly sessionFile: string | undefined;`（`:146`）、`readonly model: ModelLike | undefined;`（`:151`）。
- 方法签名里 `unknown` 是默认逃生口：`bindExtensions?: unknown;`（`:174`）、`setFooter(factory: unknown): void;`（`ExtensionUiContextLike`）。

**改动规则（可从代码推出）**：新增 SDK 能力时**先扩 `lib/pi-types.ts`，再在实现里消费**；不要在 `lib/rpc-manager.ts` 里直接 `import type ... from "@earendil-works/..."` 去引用新形状（`grep` 显示 SDK 类型 import 集中在 `pi-types.ts`、`agent-event-wire.ts`、`rpc-manager.ts` 三处）。

`lib/agent-event-wire.ts` 是**第二条适配边界**（SSE wire → 客户端模型），同样用结构化类型而非 SDK 原类型：

```ts
// lib/agent-event-wire.ts:3-6
export interface AgentEventLike { type: string; [key: string]: unknown; }
// :9-25 用 Extract/Exclude 从 SDK 的 JsonAgentSessionEvent 派生客户端专用事件
type JsonMessageUpdateEvent = Extract<JsonAgentSessionEvent, { type: "message_update" }>;
```

### 3.4 `satisfies` 与 `as const`

`satisfies` 全仓只有 **6 处**，一律用于「对象字面量要同时满足外部类型 + 保留字面量推断」：

```ts
lib/session-reader.ts:740      return [{ type: "image", source } satisfies ImageContent];
lib/session-tool-selection.ts:51 } satisfies SessionToolSelectionData);
components/ModelsConfig.tsx:738 } satisfies React.CSSProperties;
hooks/useAgentSession.ts:523    } satisfies SessionStatsInfo;
app/api/app-update/route.ts:76  } satisfies AppUpdateResponse);
app/api/plugins/route.ts:284    } satisfies PluginPackageInfo;
```

`as const` 66 处，用于常量表 / 元组 / 需要字面量类型的地方：

```ts
// hooks/useViewportHeight.ts:41
export const KEYBOARD_RETRY_DELAYS = [300, 700, 1200] as const;
```

### 3.5 「零」清单（可作为 spec 的 forbidden 起点）

| 模式 | 全仓计数 | 命令 |
|------|----------|------|
| `any`（`: any` / `<any>` / `as any` / `any[]`） | **0** | `grep -rnE ":\s*any\b|<any>|as any|any\[\]" --include="*.ts" --include="*.tsx" lib components hooks app \| wc -l` |
| `@ts-expect-error` | **0** | `grep -rn "@ts-expect-error" ... \| wc -l` |
| `@ts-ignore` | **0** | 同上（只有 1 处 `eslint-disable` 是给 `no-require-imports`） |
| 非空断言 `x!.y` / `x!)` | **0** | `grep -rnE "[A-Za-z0-9_\]\)]!\." …` 与 `"[A-Za-z0-9_\]\)]!\)"` 均 0 |
| `enum` / `export enum` | **0** | `grep -c "^export enum \|^enum "` |
| schema 校验库（zod/yup/io-ts/valibot/ajv/superstruct/effect） | **0** | `grep -n "zod\|yup\|…" package.json` |
| 全局 `types.d.ts` / barrel 类型文件 | **0** | `app/` 0 个类型导出；无 `lib/types/index.ts` |

ESLint 侧对 `any` 还有 `@typescript-eslint/no-explicit-any: error`（§4.2）兜底，`@typescript-eslint/ban-ts-comment: error` 堵 `@ts-ignore`。

---

## 4. Lint

### 4.1 配置：Next 两个 flat preset + 3 条 `off`

```js
// eslint.config.mjs（全文 17 行）
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".agents/**", ".pi/**", ".trellis/**"] },   // :5 只忽略 Trellis/agent 产物目录
  ...coreWebVitals,                                        // :6
  ...typescript,                                           // :7
  {
    rules: {
      "react-hooks/immutability": "off",                   // :10
      "react-hooks/refs": "off",                           // :11
      "react-hooks/set-state-in-effect": "off",            // :12
    },
  },
];

export default eslintConfig;
```

- **没有** `.eslintrc*`、没有自建 plugin、没有 `overrides`、**没有引入 type-aware linting**（`eslint --print-config` 输出 `parserOptions.project: undefined`、`projectService: undefined`）。这意味着 `no-floating-promises` / `no-misused-promises` / `await-thenable` 这类需要类型信息的规则**不在门禁内**；`await` 纪律靠人工 review + `@typescript-eslint/no-unused-expressions`。
- `ignores` 只排 `.agents/**`、`.pi/**`、`.trellis/**`；`node_modules`、`.next` 由 ESLint 默认忽略。
- 3 条 `off` 是**对 `eslint-config-next@16.3.5` 新 React Compiler 规则集的有意豁免**（那份 config 里 `react-hooks/*` 从 7.0.1 起大幅扩规则）。`immutability` / `refs` / `set-state-in-effect` 三条在该仓库大量既有写法里会误报（refs 用于 `ChatMinimap`、`AppShell` 的 imperative handle；set-state-in-effect 用于视口/滚动同步）。**改这三条会引入成百上千条诊断，属于跨任务行为变更。**

### 4.2 规则实际集合与严重级（`eslint --print-config components/ChatWindow.tsx`）

共配置 **114 条**，其中 **30 条为 `off`**。

`react-hooks/*`（17 条；`2` = error，`1` = warn，`0` = off）：

```
react-hooks/rules-of-hooks              => error
react-hooks/static-components            => error
react-hooks/use-memo                     => error
react-hooks/component-hook-factories     => error
react-hooks/preserve-manual-memoization  => error
react-hooks/globals                      => error
react-hooks/error-boundaries             => error
react-hooks/purity                       => error
react-hooks/set-state-in-render          => error
react-hooks/config                       => error
react-hooks/gating                       => error
react-hooks/exhaustive-deps              => warn    ← 唯一允许"故意漏依赖"的逃生口
react-hooks/incompatible-library         => warn
react-hooks/unsupported-syntax           => warn
react-hooks/immutability                 => off     ← eslint.config.mjs:10
react-hooks/refs                         => off     ← :11
react-hooks/set-state-in-effect          => off     ← :12
```

`jsx-a11y/*`（6 条，**全部 warn**；lint 当前 0 warning 说明现有代码无违规）：

```
jsx-a11y/alt-text                  => warn  (options: { elements: ["img"], img: ["Image"] })
jsx-a11y/aria-props                => warn
jsx-a11y/aria-proptypes            => warn
jsx-a11y/aria-unsupported-elements => warn
jsx-a11y/role-has-required-aria-props => warn
jsx-a11y/role-supports-aria-props  => warn
```

`@typescript-eslint/*`（20 条，来自 `eslint-config-next/typescript` preset，**不是** `recommended-type-checked`）：

```
error: ban-ts-comment, no-array-constructor, no-duplicate-enum-values, no-empty-object-type,
       no-explicit-any, no-extra-non-null-assertion, no-misused-new, no-namespace,
       no-non-null-asserted-optional-chain, no-require-imports, no-this-alias,
       no-unnecessary-type-constraint, no-unsafe-declaration-merging, no-unsafe-function-type,
       no-wrapper-object-types, prefer-as-const, prefer-namespace-keyword, triple-slash-reference
warn:  no-unused-vars, no-unused-expressions (options: allowShortCircuit/Ternary/TaggedTemplates = false)
```

关键推论：
- `no-explicit-any: error`（不是 warn）——与「全仓 0 个 any」互为印证。
- `@typescript-eslint/no-empty-object-type: error` 解释了 `lib/pi-types.ts` 里 `interface ResourceLoaderLike { getSkills(): … }` 必须有方法体，不能写空接口。
- `jsx-a11y/*` 只是 **warn**，所以「lint 通过」不完全等于 a11y 通过；但当前 0 warning，说明 6 条规则在现有代码上全绿。
- `react-hooks/exhaustive-deps: warn`：全仓 4 处 `eslint-disable-next-line react-hooks/exhaustive-deps`，都带说明性代码上下文（`components/FileExplorer.tsx:274`、`components/ModelsConfig.tsx:312`、`hooks/useAgentSession.ts:690`、`:2558`；另有 `components/SkillsConfig.tsx:606`、`components/PluginsConfig.tsx:726` 用 `eslint-disable-line`）。

### 4.3 `eslint-disable` 的唯一形态：行内 + 具体规则 + 紧邻理由

```
10 × eslint-disable-next-line @next/next/no-img-element
 4 × eslint-disable-next-line react-hooks/exhaustive-deps
 1 × eslint-disable-next-line @next/next/no-require-imports
 1 × eslint-disable-next-line @next/next/no-page-custom-font
```

- **没有任何文件级 `/* eslint-disable */`**，也没有 `eslint-disable-next-line` 后面不写规则名的裸用法。
- `no-img-element` 的 10 处集中在 `FileViewer.tsx:571,1769`、`ChatInput.tsx:478,1983`、`MessageView.tsx:415,1444,1632`、`MarkdownBody.tsx:151`、`ImagePreview.tsx:89`——都是**必须用原始 `<img>` 才能拿到的行为**（blob/data URL、onload 尺寸、缩放），Next `<Image>` 不适用。
- `no-require-imports` 的唯一豁免在 `lib/terminal-manager.ts:81`——`node-pty` 必须 `require`（native addon）。

### 4.4 跑法与已知陷阱

**跑法**：

```bash
npm run lint              # = eslint .
node_modules/.bin/eslint <file> --format json
node_modules/.bin/eslint --print-config <file>   # 查某文件的最终规则严重级
```

**陷阱 1（已在 `quality-guidelines.md` 记录，此处只补复现方式）**：同一 checkout 上先跑过 `pnpm install`（存在 `pnpm-lock.yaml`）再跑 `npm install`，`node_modules` 会与 `package-lock.json` **不一致**，`react-hooks/preserve-manual-memoization` 会出现 14 条**幻影诊断**（干净 `npm ci` 后为 0）。

归因四步（照抄即可）：
```bash
node_modules/.bin/eslint --print-config components/ChatInput.tsx | grep -A1 preserve-manual-memoization  # 规则级仍是 error?
node_modules/.bin/eslint . --format json | node -e "…"   # 覆盖文件数（本次 474）
node -e "console.log(require('eslint/package.json').version)"                     # 本次 9.39.4
find node_modules -path "*eslint-plugin-react-hooks/package.json" -maxdepth 4      # 本次 7.0.1
```
交叉验证首选：`git write-tree` + `git commit-tree` 拿到候选树，在独立 worktree `npm ci` 后复跑。**不要把带 `node_modules` 的临时 worktree 建在 `/tmp`**（本机 `/tmp` 是 2 GiB tmpfs）。

**陷阱 2（本文件的补充观察）**：`eslint --print-config` 的输出结构依赖 eslint 版本；
本机 `require("eslint-config-next/package.json")` 会因 `exports` 字段而抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，
**必须**用 `find node_modules -path "*eslint-config-next/package.json"` 或 `--print-config` 反推版本，不要用 `require()`。

**陷阱 3**：`react-hooks/*` 规则集随 `eslint-config-next` 小版本变化（16.3.5 已含 React Compiler 系列规则），跨版本比较诊断数前必须先比 plugin/config 版本。

### 4.5 当前基线（2026-09-19，本机 Node 26）

```
$ npm run lint
ESLint: No issues found
real 0m44.6s

$ node_modules/.bin/eslint . --format json  →  files: 474  errors: 0  warnings: 0
```

- 覆盖文件数 **474**（`quality-guidelines.md` 历史记录的是 462，差异来自新增文件，不是配置变化）。
- 退出码 0。

---

## 5. 测试惯例

（`hooks/` 部分与 `research/hooks-and-state.md` §1.3 互为补充；`e2e/` 部分与 `research/directory-layout.md` §6 互为补充。）

### 5.1 `node:test` + `jiti` 加载 TS 的确切写法

**统一样式（每个测试文件的开头）**：

```js
// lib/i18n/format.test.mjs:1-4 —— 纯 .ts，同目录
import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTime, interpolateMessage, translateMessage } from "./format.ts";
```

```js
// lib/i18n/registry.test.mjs:1-9 —— 需要 jiti（模块内使用了 @/ 别名或 TS 语法）
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { getLocalePlugin, getSupportedLocales, resolveBrowserLocale } = await jiti.import("./registry.ts");
```

**实测到的 `createJiti(...)` 变体分布**（`grep -rho "createJiti([^;]*" … | sort | uniq -c`）：

| 变体 | 次数 | 何时用 |
|------|------|--------|
| `createJiti(import.meta.url)` | 34 | 同目录纯 `.ts`，无别名需求 |
| `createJiti(import.meta.url, {` （多行 options） | 32 | 需要 alias / moduleCache 之外的选项 |
| `createJiti(import.meta.url, { tsconfigPaths: true })` | 11 | 模块里用了 `@/...` 别名 |
| `createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false })` | 3 | 需要每次拿到新模块实例（缓存/单例类测试） |
| `createJiti(import.meta.url, { interopDefault: true, moduleCache: false })` | 3 | 同上 + CJS 互操作 |
| `createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true })` | 1 | `.tsx`（`components/ChatInput.test.mjs:10`） |
| `createJiti(import.meta.url, { alias: { "@": process.cwd() } })` | 1 | `app/api/plugins/route.test.mjs:17` |
| `createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } })` | 1 | 用相对 URL 建 alias（比 `process.cwd()` 稳） |

**惰性单次 import**（在测试体内部按用例加载，用于隔离模块副作用）：

```js
// 全仓 29 处：lib/worktree.test.mjs 等（grep -rn "createJiti(import.meta.url).import(" app components hooks lib public | wc -l → 29）
const { toNativePath } = await createJiti(import.meta.url).import("./paths.ts");
```

**另一条并行路径**：Node 原生 strip-types，直接 `await import("./x.ts")`，`research/directory-layout.md` §6.2 统计到 109 个文件有动态 `.ts` import。
两者并存的原因：`npm test` 脚本用的是 `node --experimental-strip-types --test …`，而 `jiti` 负责 `.tsx`、`@/` 别名和 `moduleCache` 控制。

**`.tsx` 的额外步骤**：SSR 渲染时如果组件 import 了 `.module.css`，必须用 `node:module` 的 `registerHooks` 打桩（唯一实例）：

```js
// components/ChatMinimap.test.mjs:2-13
import { registerHooks } from "node:module";
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".module.css")) return nextLoad(url, context);
    return { format: "module", shortCircuit: true,
             source: "export default new Proxy({}, { get: (_, key) => String(key) });" };
  },
});
```

### 5.2 测试文件放置与命名

- **与源文件同目录**：`lib/x.ts` → `lib/x.test.mjs`；`components/X.tsx` → `components/X.test.mjs`；`hooks/useX.ts` → `hooks/useX.test.mjs`。
- **特性测试用点号后缀**：`components/ChatInput.send-shortcut.test.mjs`、`components/AppShell.file-viewer-state.test.mjs`、`hooks/useAgentSession.pending-ask.test.mjs`、`lib/session-reader.pagination.test.mjs`。
- **全部 `.mjs`**（CommonJS 风格 `import`/`export` 的纯 ESM），**没有一个 `.test.ts`**：`find … -name "*.test.ts" -o -name "*.test.tsx"` → 0。
- 覆盖目录由 `npm test` 的 glob 硬编码：`app/**`、`components/**`、`hooks/**`、`lib/**`、`public/**`——**新目录里的测试不会被跑到**。
- 允许跨目录测对应实现（`lib/next-config.test.mjs` 测仓库根的 `next.config.ts`），但文件仍放 `lib/`。
- `lib/written-file-sources.check.test.mjs` 是**唯一**的 `.check.test.mjs`，是任务期一次性强校验，**不是通用约定**。

### 5.3 组件/hook 测试的两套风格：动机与局限

| 风格 | 数量（`components/`） | 机制 |
|------|----------------------|------|
| A. 读源码文本 + 正则/`indexOf` 断言 | **31** | `readFile(new URL("./X.tsx", import.meta.url), "utf8")` |
| B. `react-dom/server` 的 `renderToStaticMarkup` | **11** | `AnsiText`、`ChatInput`、`ChatMinimap`、`ExtensionStatusBar`、`ExtensionWidgets`、`FileViewer.state`、`MarkdownBody`、`MermaidBlock`、`MessageView`、`TrellisSubagentRecords`、`TurnWrittenFiles` |

**为什么没有 DOM 渲染测试**（硬证据链）：
- `package.json` 没有 `jsdom`、`happy-dom`、`@testing-library/react`、`vitest`。
- 受影响的行为大量依赖 `EventSource`、`fetch`、`document.visibilityState`（`hooks/useAgentSession.ts`）、`visualViewport`、`ResizeObserver`、`matchMedia`——都不是 `node:test` 能提供的能力。
- 因此项目把可测逻辑抽成**同文件导出的纯函数**，再用 `jiti.import` 测：

  ```js
  // hooks/useViewportHeight.test.mjs:6
  const { KEYBOARD_RETRY_DELAYS, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");
  // components/ChatAppearance.test.mjs:18
  } = await jiti.import("../hooks/useChatAppearance.ts");
  ```
- 无法抽离的时序约束（SSE grace window、run id 守卫、事件顺序）用**源码子串断言**锁死，防止后续重构悄悄删掉保护逻辑：

  ```js
  // hooks/useAgentSession.test.mjs:7-12
  const finishSource = source.slice(
    source.indexOf("const finishPromptWithoutStream"),
    source.indexOf("const waitForPromptSettlement"),
  );
  ```

**代表 1 —— 源码断言 + 顺序断言**：`components/SessionSidebar.project-identity.test.mjs:5-25`
```js
const customPathSource = source.slice(customPathStart, customPathEnd);
assert.match(customPathSource, /projectRoot\?: string;[\s\S]*?projectKey\?: string;/);
const identityUpdate = customPathSource.indexOf("setValidatedProject(");
const cwdUpdate = customPathSource.indexOf("setSelectedCwd(");
assert.ok(identityUpdate >= 0, "validated project identity is retained");
assert.ok(cwdUpdate > identityUpdate, "identity is retained before cwd changes");
```
**它能证明**：调用存在 + 调用顺序正确。
**它不能证明**：实际点击后真的走了这条路径、DOM 里真的显示了校验后的路径 → 这类归 `e2e/`。

**代表 2 —— 源码断言 + 单行正则计数**：`components/ChatAppearance.test.mjs:6-27`
```js
const widthVariable = /var\(--chat-content-max-width, 820px\)/g;
test("chat content keeps the existing 820px default behind one shared variable", () => {
  assert.equal((chatWindow.match(widthVariable) ?? []).length, 2);
  assert.equal((chatInput.match(widthVariable) ?? []).length, 1);
  assert.match(globals, /--chat-content-max-width: 820px;/);
  assert.doesNotMatch(chatWindow, /max-w-\[820px\]|maxWidth: 820/);
});
```
**它不能证明**：CSS 在浏览器里真的生效（只有 e2e 的 `chat-appearance.mjs` 能）。
→ **写 spec 时必须把这条说清楚**：源码断言是「防回归锁」，不是功能验收。

**`renderToStaticMarkup` 的局限**（同样要写进 spec）：
- 只跑一次渲染，没有 `useEffect`、没有事件、没有状态更新（`components/ChatInput.test.mjs:630` 的注释就明说 "Execute the component's actual callback without mounting the rest of the UI"，靠手工调用捕获到的回调来间接测）。
- 需要 `.module.css` 打桩（`ChatMinimap.test.mjs`）和 `createJiti(..., { jsx: { runtime: "automatic" } })`。
- 断言对象是 HTML 字符串（`assert.match(html, /…/)`），不要写脆弱的选择器。

### 5.4 i18n 三语一致性测试

`lib/i18n/registry.test.mjs:39-54` 对 `en` / `zh-CN` / `zh-TW` 做**结构性强制**：

```js
test("built-in locale packages have the complete English key and required placeholder sets", () => {
  const englishMessages = getLocalePlugin("en").messages;
  const englishKeys = Object.keys(englishMessages).sort();
  const placeholders = (message) => [...message.matchAll(/\{([\w.-]+)\}/g)].map((m) => m[1]).sort();
  const optionalPlaceholders = { "files.conflictSummary": ["countSuffix"] };

  for (const locale of getSupportedLocales().filter((id) => id !== "en")) {
    const messages = getLocalePlugin(locale).messages;
    assert.deepEqual(Object.keys(messages).sort(), englishKeys, `${locale} keys must match English`);
    for (const key of englishKeys) {
      const optional = optionalPlaceholders[key] ?? [];
      const required = placeholders(englishMessages[key]).filter((n) => !optional.includes(n));
      const translated = placeholders(messages[key]).filter((n) => !optional.includes(n));
      assert.deepEqual(translated, required, `${locale}.${key} placeholders must match English`);
    }
  }
});
```

配套：
- `getSupportedLocales()` 的精确断言 `["en", "zh-CN", "zh-TW"]`（`:31-36`）——**加语言必须改这个测试**。
- `resolveBrowserLocale` 的 **16 条**区域码映射断言（`:15-28`），含 `zh-Hans-HK → zh-CN`、`zh-Hant → zh-TW`、大小写不敏感。
- 插值与回退：`lib/i18n/format.test.mjs`（`{name}` 插值、缺 key 回退英文、再回退 key 原文、按 locale 格式化相对时间）。
- 文案规则写在 `docs/i18n.md`（英文保持词表、`useI18n().t()`、可见文本/`title`/`aria-label`/`placeholder` 都要走 i18n）。
- 三语文件体量几乎相同：`en.ts` 36.1 KB、`zh-CN.ts` 36.0 KB、`zh-TW.ts` 36.6 KB——**这是「三语一起改」的物理证据**。

### 5.5 e2e Playwright 脚本

**运行方式**（`e2e/README.md`）：

```sh
npm ci
npx playwright install chromium
npm run test:e2e            # = node e2e/run.mjs && node e2e/subagents.mjs
npm run test:e2e:subagents
npm run test:terminal
```

**如何起服务**（`e2e/run.mjs`）：
1. `:16` `const mode = process.env.E2E_SERVER_MODE || "dev"`；只接受 `dev` | `start`（`:17` assert）。
2. `:18` **dev 模式必须没有 `.next/dev/lock`**：`assert.ok(mode !== "dev" || !existsSync(join(root, ".next/dev/lock")), "Use a checkout without an active dev server")`。`e2e/subagents.mjs:13` 有同样一行。
3. `:118-123` 用 `net.createServer().listen(0)` **探一个空闲端口**（不固定 30141），然后关掉，把端口交给 Next。
4. `:124-128` `spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "-H", "127.0.0.1", "-p", port])`，环境里塞 `PI_CODING_AGENT_DIR=<临时目录>`、`PI_WEB_PASSWORD=""`、`NEXT_TELEMETRY_DISABLED="1"`；stdout/stderr 落 `server.log`。
5. `:136-148` 轮询 `/api/sessions` 直到就绪，超时 120s。
6. 所有 fixture 会话在启动前写入临时 `PI_CODING_AGENT_DIR`，结束后清理；**不需要模型凭据，也不需要读用户真实会话**。

**为什么禁止在开发 checkout 跑 `next build`**：
- `AGENTS.md:11`：`**Never run \`next build\` during dev** — pollutes \`.next/\` and breaks \`npm run dev\`.`；`docs/i18n.md` 的 Verification 段重复了同一句。
- 机制层面：`dev`/`start` 共用 `.next/`，构建产物会覆盖 dev 的 Turbopack 图；且 `.next/dev/lock` 被同 checkout 的 dev server 占用时，e2e `assert.ok` 会直接失败而非给出可读错误。
- CI 因此**分两个 job**（`.github/workflows/ci.yml`）：
  - `checks`（15 min）：`npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm test`
  - `e2e`（20 min）：`npm ci` → `npx playwright install --with-deps chromium` → `npm run build` → `npm run test:e2e`（`E2E_SERVER_MODE=start`）→ 失败时上传 `test-results/e2e/`

**覆盖面**（`e2e/README.md` Coverage 段）：5000 条消息会话只开最后 50 条 + 分页无重复无缺口 + 分支 context 跟随 leaf + markdown/代码块/真实 tool-call 渲染 + 聊天宽/字号持久化 + 未知 session 与越权路径拒绝 + 扩展弹窗键盘导航/Esc/倒计时/服务端过期 + Trellis 执行快照（desktop/mobile、A-B-A 竞态、合成 SSE 重连）。**明确不包括**：真实模型 prompt、流式输出、agent 执行。
- 产物：失败时保存截图 + trace + server log 到 `test-results/e2e/`；`npx playwright show-trace test-results/e2e/trace.zip`。
- 本机 Playwright 已装 `chromium_headless_shell-1194`（`~/.cache/ms-playwright`）。

**本次调研未运行 e2e 的原因（照实记录，不要写成通过）**：
- 本 checkout 存在 `.next/dev/lock`（残留），会命中 `e2e/run.mjs:18` 的 assert；
- 删除该 lock 会干扰正在使用的开发环境，已超出本次只读调研范围。
- 因此 §6.2 的 e2e 耗时只能给「CI 层面量级」（job timeout 20 min，含 `next build`），不能给本机实测值。

---

## 6. 门禁与基线

### 6.1 三项门禁的覆盖面

| 门禁 | 命令 | 覆盖面 | 本地耗时（本次实测） | 是否 type-aware |
|------|------|--------|---------------------|-----------------|
| 类型 | `node_modules/.bin/tsc --noEmit` | 全部 `**/*.ts(x)` + `.next/types/**`（`tsconfig.json:31-37`） | **10.5s**（有 tsbuildinfo 增量） | 是 |
| Lint | `npm run lint`（= `eslint .`） | 474 个文件（除 `.agents/.pi/.trellis`） | **44.6s** | 否 |
| 单测 | `npm test` | `app/components/hooks/lib/public` 5 个 glob，无覆盖统计 | **74.4s** | n/a |
| e2e | `npm run test:e2e` | 真实 Chromium；dev 或 start 模式（CI 用 start + build） | 未跑（见 §5.5） | n/a |

### 6.2 当前基线（2026-09-19，Node v26.1.0，工作树有未提交的 `.pi/agents/*` 改动）

```
$ node_modules/.bin/tsc --noEmit
real 0m10.465s   exit 0   （无输出）

$ npm run lint
ESLint: No issues found
real 0m44.567s   exit 0
files: 474   errors: 0   warnings: 0

$ npm test
ℹ tests 1311
ℹ suites 10
ℹ pass 1311
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 74055.197469
real 1m14.401s   exit 0
```

**必须一起记录的版本指纹**（否则数字不可比）：
- `eslint 9.39.4`、`eslint-config-next 16.3.5`、`eslint-plugin-react-hooks 7.0.1`、`typescript-eslint/parser 8.57.1`
- `typescript ^5`、`next 16.3.5`、Node（本地 26.1.0 / CI 22.19.0）
- lint 覆盖文件数 474；`tsc` 有 `tsconfig.tsbuildinfo`

### 6.3 提交前必须「与基线逐项对照」

来自 `quality-guidelines.md` 现有内容的硬要求（本文件只是补上可复现口径）：

1. 最小集合：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test` **三者退出码为 0**，且**计数与基线逐项对照记录在任务 `research/` 下**。
2. **报告「无新增诊断」时必须同时给出「基线是怎么得到的」**（哪个依赖树、哪次安装）；诊断数变化时必须归因（规则级别 / 文件覆盖数 / 插件与 config 版本 / 依赖树一致性）。**不允许用「数字变小了」直接当通过。**
3. 交叉验证首选：`git write-tree` + `git commit-tree`（不写 ref）拿候选树，在独立 worktree `npm ci` 后复跑 tsc / lint / `npm test`；临时 worktree **不要建在 `/tmp`**（本机 `/tmp` 是 2 GiB tmpfs，两个 `node_modules` 会 `ENOSPC`），用仓库同级的普通目录。
4. 证据必须区分**数据链路脚本**与**真实浏览器运行**（见 §7）。

---

## 7. 质量相关既有硬约束（从 `quality-guidelines.md` + `AGENTS.md` + 已写 spec 提炼）

| 约束 | 出处 | 说明 |
|------|------|------|
| **开发期禁止 `next build`** | `AGENTS.md:11`；`docs/i18n.md` Verification 段 | 会污染 `.next/` 并让 `npm run dev` 失败；`e2e/run.mjs:18` 直接 assert `.next/dev/lock` 不存在 |
| **对话区新增排版表面的字号必须用变量** | `.trellis/spec/frontend/settings-dialog-mobile.md:60-63` | 写 `calc(<设计字号>px + var(--chat-font-size-offset, 0px))`，不要写死 `rem/px`，也不要把 offset 套到非对话区（文件预览、设置面板）。历史教训：扩展 widget 曾写死 `14px`，字号滑块对其无效（上游 `860698a` 修复）。`lib/chat-font-preference.ts` 与 `--chat-font-size-base` 已删除，禁止再引用 |
| **同一功能的两类证据不得互相冒充** | `quality-guidelines.md`「数据链路脚本不等于浏览器验证」 | 数据脚本（如 `research/verify-e2e.mjs` 24 个产物、`research/verify-ac5.mjs` 1242→1929 条路径）只证明数据正确；点击/右栏/viewport 必须真跑 Playwright 并把断言输出与截图留在任务 `research/`；跑不起来要区分「环境阻塞」与「功能失败」，未覆盖就写「未覆盖」，**禁止用代码阅读推断成通过** |
| **路径比较禁用 `===`** | `AGENTS.md:216` | 用 `samePath()`；git 输出的 POSIX 绝对路径必须先过 `toNativePath()`。Windows 上裸相等曾让 `isTopLevel` 恒为 false、worktree 切换器整体消失 |
| **文件访问授权只有一份实现** | `AGENTS.md:221` | `isPathWithinRoots()`（`lib/path-security.ts`）是 `isFilePathAllowed()` 背后的唯一实现，是安全边界，不许复制 |
| **toolCall 字段差异只能在一处归一** | `AGENTS.md:185`、`lib/normalize.ts:3-40` | `{type,id,name,arguments}`（文件格式）↔ `{toolCallId,toolName,input}`（本项目类型）；`normalizeToolCalls()` 必须在 `session-reader.ts` 与 `useAgentSession.ts` 两侧都调用 |
| **凭证/配置写入必须原子** | `lib/atomic-file.ts:6-10 writePrivateFileAtomicSync` | 临时文件 + `renameSync`，避免默认权限泄露；settings/cache 另用 `proper-lockfile` |
| **`enabledModels` 模式不得当字符串比较** | `AGENTS.md`（model-scope 段） | 必须走 `lib/model-scope.ts` 委托 SDK 的 `resolveModelScopeWithDiagnostics()` |

---

## 8. 对 spec 文件的处置建议

### 8.1 `type-safety.md`：5 个模板 section 的取舍

模板 section 是 `Overview` / `Type Organization` / `Validation` / `Common Patterns` / `Forbidden Patterns`。建议**保留全部 5 个、不新增**，因为五项都有实打实的语料：

| section | 建议内容（语料位置） | 是否与其它 spec 重复 |
|---------|---------------------|---------------------|
| Overview | `tsconfig.json` 实际开关 + 未启用项造成的既成事实（本文件 §1.1–§1.3）；一句「无 schema 库、无 `any`、无 `@ts-expect-error`、无 `enum`」（§3.5） | 不重复。`directory-layout.md` §5.2 只讲 `include/exclude` 边界 |
| Type Organization | 四个公共类型集（`lib/types.ts` / `lib/api-types.ts` / `lib/git-types.ts` / `lib/pi-types.ts`）+「其余与实现同文件导出」+「无 barrel」（§2.4） | 与 `directory-layout.md` 有轻微重叠，**只写「哪个类型该放哪」的决策规则**，不要重抄目录树 |
| Validation | `isRecord` 范式 + 每模块自带守卫 + 内联类型谓词 + `T \| null` 返回 + `try/catch` 包裹 `JSON.parse`（§3.1）；**明确写「本仓库不用 zod/yup 等库，不要引入」** | 不重复 |
| Common Patterns | 字面量联合 + `Set` 成员校验、`Extract/Exclude/Omit/Partial/Record` 派生、`satisfies`（6 处）、`as const`、`import type`/`export type`、`?` vs `\| null` 判据（§2.1–§2.3、§3.4） | 不重复 |
| Forbidden Patterns | `any` / `@ts-expect-error` / 非空断言 `!` / `enum` / schema 库（全部 0 次，§3.5）；`as` 的可接受场景白名单（§3.2）；`?: T \| undefined` 写法（0 次）；文件级 `/* eslint-disable */`（0 次） | 不重复。`eslint` 硬门槛写进 `quality-guidelines.md`，本文件只写「为什么」 |

**必须写进 spec 的两条「不要动」**（否则下个 agent 会去"顺手修复"）：
- 不要为 `isRecord` 抽公共模块（每模块自带是刻意的隔离，`lib/trellis-subagent-records.ts:1-11` 有原始理由）。
- 不要开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`——会引发全仓级行为变更。

### 8.2 `quality-guidelines.md`：剩余 4 段怎么写才不与既有 2 段重复

既有 2 段（不删、不改）：
- 「Testing Requirements → 验证基线必须来自与锁文件一致的依赖树」
- 「Testing Requirements → 数据链路脚本不等于浏览器验证」

建议写法（**新写的 4 段只做「导航 + 补充」，不重述已有两段的细节**）：

1. **Overview**（≤ 15 行）
   - 一句话说清门禁三件套 + e2e，并**链接到下面各段**；
   - 给当前基线的「形状」而不是数字本身：`tsc 0 错` / `eslint 0 error 0 warning（约 474 文件）` / `npm test 全绿（约 1300 例）`；
   - 明确「数字会变，验证时以同一依赖树复跑为准」→ 指向已写好的「验证基线」段（**避免复制**）。

2. **Forbidden Patterns**
   只放**可机检 + 有反例代价**的条目：
   - 开发期 `next build`（`AGENTS.md:11`）；
   - 对话区裸 `px`/`rem` 字号（`settings-dialog-mobile.md:60`）；
   - 路径用 `===` 比较（`AGENTS.md:216`）；
   - `any` / `@ts-expect-error` / 非空断言 / `enum`（§3.5，附「全仓 0 次」的实证）；
   - 文件级 `/* eslint-disable */`（§4.3：全仓 0 处，豁免必须行内 + 指名规则 + 紧邻理由）；
   - 数据脚本冒充浏览器验证（**一行引用**，细节留既有段）。

3. **Required Patterns**
   - 提交前三件套 + 逐项对照基线（引用既有段）；
   - 新增用户可见文案必须同时改三语（`docs/i18n.md`、`lib/i18n/registry.test.mjs:39`）；
   - 新增测试放 5 个 glob 目录内（`directory-layout.md` §6.2）；
   - 凭证/设置写入用原子写 + `proper-lockfile`；
   - 组件/接口的 lint 期望：`no-explicit-any`、`ban-ts-comment` 是 **error** 级（§4.2）。

4. **Code Review Checklist**
   直接做成勾选表，每项都能被命令验证（避免"注意代码质量"这类空话）：
   - [ ] `tsc --noEmit` / `npm run lint` / `npm test` 退出码 0，且与基线逐项对照已记录在任务 `research/` 下
   - [ ] lint 诊断数有变化时完成归因（规则级别 / 文件覆盖数 / plugin+config 版本 / 依赖树一致性）
   - [ ] 新增 `.ts/.tsx` 里没有 `any` / `@ts-expect-error` / 非空断言 / `enum`
   - [ ] 新边界输入走 `unknown` + 守卫，不新增 schema 库依赖
   - [ ] 新增 `eslint-disable` 是行内 + 指名规则 + 紧邻理由
   - [ ] 新增用户可见文案三语齐全，且 `npm test` 里 i18n 一致性用例通过
   - [ ] 对话区新增字号使用 `calc(… + var(--chat-font-size-offset, 0px))`
   - [ ] 涉及点击/右栏/viewport 的断言跑过 Playwright；未覆盖项明确标注「未覆盖」
   - [ ] 没有在开发 checkout 里跑过 `next build`（`git status` 确认 `.next` 未被提交）

**不要写进这批新段的**：`directory-structure` / `component` / `hook` / `state` 的内容（已有专门 spec 与三份 research）；`trellis-subagent-records.md` 已覆盖的 Trellis 快照质量约束（避免双份真相）。

---

## 附：本次调研的可复现命令

```bash
# --- TS 严格度 ---
cat tsconfig.json
grep -n "noUncheckedIndexedAccess\|exactOptionalPropertyTypes\|verbatimModuleSyntax" tsconfig.json
grep -rn "^\s*[a-zA-Z_]*: undefined,$" --include="*.ts" lib components hooks app   # exactOptional 关的痕迹（11 处）

# --- 类型写法 ---
grep -rc "^\s*\(export \)\?interface " --include="*.ts" --include="*.tsx" lib components hooks app
grep -rc "^\s*\(export \)\?type [A-Z]"  --include="*.ts" --include="*.tsx" lib components hooks app
grep -rn "^\s*[a-zA-Z_]*?\s*:" --include="*.ts" --include="*.tsx" lib | wc -l   # 400
grep -rn "^\s*[a-zA-Z_]*\s*:.*| null" --include="*.ts" --include="*.tsx" lib | wc -l  # 50
grep -rn "?: .*| undefined" --include="*.ts" --include="*.tsx" lib | wc -l      # 0

# --- 边界与守卫 ---
grep -rln "function isRecord" --include="*.ts" lib          # 11 个文件各一份
grep -rln "function isObject" --include="*.ts" lib          # 5 个文件
grep -rhoE "\) as [A-Za-z_.]+|\[[a-zA-Z0-9_.]+\] as [A-Za-z_.]+| as [A-Z][A-Za-z_]+" \
  --include="*.ts" --include="*.tsx" lib components hooks app | wc -l            # 272
grep -rn "as unknown as" --include="*.ts" --include="*.tsx" lib components hooks app | wc -l  # 20
grep -rn "satisfies " --include="*.ts" --include="*.tsx" lib components hooks app          # 6
grep -rnE ":\s*any\b|<any>|as any|any\[\]" --include="*.ts" --include="*.tsx" lib components hooks app | wc -l  # 0
grep -rn "@ts-expect-error" --include="*.ts" --include="*.tsx" lib components hooks app | wc -l  # 0
grep -rnE "[A-Za-z0-9_\]\)]!\." --include="*.ts" --include="*.tsx" lib components hooks app | wc -l  # 0
grep -rn "^export enum \|^enum " --include="*.ts" --include="*.tsx" lib components hooks app | wc -l  # 0

# --- Lint ---
cat eslint.config.mjs
node_modules/.bin/eslint --print-config components/ChatWindow.tsx > /tmp/cfg.json
node -e "const c=require('/tmp/cfg.json');for(const [k,v] of Object.entries(c.rules)) \
  if(k.startsWith('react-hooks/')||k.startsWith('jsx-a11y/')||k.includes('explicit-any')) console.log(k,JSON.stringify(v))"
node -e "const c=require('/tmp/cfg.json');console.log('project:',c.languageOptions.parserOptions?.project)"  # undefined → 非 type-aware
node_modules/.bin/eslint . --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log('files',a.length,'err',a.reduce((n,f)=>n+f.errorCount,0),'warn',a.reduce((n,f)=>n+f.warningCount,0))})"
find node_modules -maxdepth 4 -path "*eslint-plugin-react-hooks/package.json" -not -path "*/dist/*"
grep -rhoE "eslint-disable(-next-line|line)? [a-z@/-]+" --include="*.ts" --include="*.tsx" lib components hooks app | sort | uniq -c | sort -rn

# --- 测试机制 ---
grep -rho "createJiti([^;]*" --include="*.test.mjs" app components hooks lib public | sort | uniq -c | sort -rn
grep -rln "renderToStaticMarkup" --include="*.test.mjs" components | wc -l     # 11
grep -rln "readFile(new URL" --include="*.test.mjs" components | wc -l          # 31
find . -name "*.test.ts" -o -name "*.test.tsx" | wc -l                          # 0
grep -n "lock" e2e/run.mjs e2e/subagents.mjs

# --- 门禁基线（只在依赖树与锁文件一致时用于对照） ---
time node_modules/.bin/tsc --noEmit
time npm run lint
time npm test
node -v; node -e "console.log('eslint',require('eslint/package.json').version)"
```
