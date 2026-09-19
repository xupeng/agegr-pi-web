# 类型安全

> 本仓库 TypeScript 的**实际**严格度、类型归属、边界守卫范式与禁用写法。
> 所有条目都来自真实代码与命令输出；写现状，不写理想状态。

## 概览

计数口径：`app/ components/ hooks/ lib/ public/` 下 257 个 `.ts/.tsx` 源文件，
不含依赖、构建产物、测试与 Trellis 配置。语法计数使用 TypeScript AST（不是文本关键词匹配）；
计数是当前快照，不是新增代码的配额。

`tsconfig.json` 与类型相关的开关只有三项：`strict: true`、`isolatedModules: true`、
`skipLibCheck: true`（另有 `noEmit`、`moduleResolution: "bundler"`、`jsx: "react-jsx"`、
`paths: {"@/*": ["./*"]}`、`target: "ES2017"`）。
**未启用**：`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`
（`grep -n "noUncheckedIndexedAccess\|exactOptionalPropertyTypes\|verbatimModuleSyntax" tsconfig.json` → 0 命中）。

三条既成事实（spec 必须照实写）：

- `noUncheckedIndexedAccess` 关 → 数组下标类型是 `T` 而不是 `T | undefined`，全仓普遍不写下标判空，
  判空只出现在真正需要之处，例如正则捕获组 `lib/written-file-sources.ts:139-143`。
- `exactOptionalPropertyTypes` 关 → `foo?: T` 允许显式写 `foo: undefined`；
  `lib/rpc-manager.ts:1306-1307`、`lib/subagent-runtime.ts:465-467`、`lib/trellis-subagent-records.ts:668`
  等有此类字面量。
- `verbatimModuleSyntax` 关 → `import type` / `export type` 是人工约定，漏写 `type` 编译器不会报错。

**两条「不要动」**（否则下个改动会顺手「修复」成灾）：

1. **不要仅为消除短小重复而机械抽取 `isRecord`**。现状是 `lib/` 下 11 个文件各自定义守卫；
   `lib/trellis-subagent-records.ts:1-11` 说明该模块不依赖 extension、Pi persistence 或 React，
   但没有宣称所有守卫必须永远独立。复用复杂解码逻辑时仍遵循共享的 code-reuse guide。
2. **不要打开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `verbatimModuleSyntax`**。
   三项都是全仓级行为变更，需单独评估诊断与迁移成本，不是能顺手加的开关。

上述源码范围：`any` 0、`@ts-expect-error` / `@ts-ignore` 0、`enum` 0；
非空断言 `!` 实际为 **66** 处（例如 `lib/terminal-manager.ts:36`），不是零。
没有项目全局 `types.d.ts`；barrel 有一处 `lib/ask-user/index.ts`。
`package.json` 没有直接声明 schema 校验库，不能据此推断依赖树内也没有。

## 类型归属

没有项目全局 `types.d.ts`；唯一 barrel 是 `lib/ask-user/index.ts`；`app/` 目录 0 个类型导出。只有四种「事实上的公共类型集」
上提到 `lib/xxx-types.ts`，其余类型与实现同文件导出（`lib/` 有 78 个文件自导出类型）。

| 位置 | 承载什么 | 证据 |
|------|----------|------|
| `lib/types.ts`（440 行 / 46 个导出） | **pi session 文件格式**的镜像类型（`SessionHeader`、`SessionEntryBase`、`AssistantContentBlock`、`SessionContext`…） | 文件头注释 "Types mirrored from pi-mono coding-agent session-manager" |
| `lib/api-types.ts`（159 行 / 24 个导出） | **HTTP API 契约**（`PluginsResponse`、`SkillsResponse`、`SubagentProfilesResponse`…） | `app/api/*/route.ts` 与客户端共用 |
| `lib/git-types.ts`（4 个导出） | `GitFileStatusKind` / `GitFileStatus` / `GitStatusResponse` / `GitFileDiffResponse` | `lib/git-status.ts`、`lib/git-changes.ts`、`lib/worktree.ts` |
| `lib/pi-types.ts`（205 行） | **SDK 的结构化类型**（AgentSession 的主要适配面，见下） | `lib/rpc-manager.ts`、`lib/subagent-runtime.ts`、`hooks/useAgentSession.ts` |

`lib/pi-types.ts` 是 AgentSession 的主要结构化适配面：只从 `@earendil-works/*` `import type` 真正需要的类型，
`export interface` 的是长期依赖的窄面（`ContextUsage`、`ModelLike`、`ToolInfo`、`AgentSessionLike`…），
而只服务 `AgentSessionLike` 字段的 `PromptTemplateLike` / `ResourceLoaderLike` 等**文件私有、不导出**。
新增 SDK 能力时的规则：**先扩 `lib/pi-types.ts`，再在实现里消费**，不要在 `lib/rpc-manager.ts` 里
直接引用 SDK 的新形状。`lib/agent-event-wire.ts` 是第二条适配边界（SSE wire → 客户端模型），
同样用结构化类型 + `Extract` / `Exclude` / `Omit` 派生，而不是 SDK 原类型。

**`interface` vs `type`（AST 声明数 328 : 167，常见分工）**：

- `interface` = 对象形状（`lib/types.ts:3-10` 的 `SessionHeader`）。
- `type` = 联合 / 字面量联合 / 工具类型派生 / 函数类型（`lib/types.ts:50`、`lib/written-file-sources.ts:31-37`、
  `lib/i18n/types.ts:2` 的 `Locale`）。
- **枚举一律不用**（`enum` 全仓 0）：改用 `type X = "a" | "b"` + `const SET = new Set<X>([...])` 做运行时校验。

## 运行时校验

**不使用任何 schema 校验库**（`package.json` 无 zod / yup / io-ts / valibot / ajv / superstruct）。
外部输入（`JSON.parse`、`req.json()`、tool `details`、SDK 事件、`globalThis` 上的旧值）统一走：
优先标 `unknown` → 手写守卫 → 返回 `T | null` / `T | undefined`。
这是容错解码器的范式，不是全仓不抛异常的规则；既有请求处理与 SDK 适配也使用断言和异常。

- 边界范式是模块自带的 `isRecord(value: unknown): value is Record<string, unknown>`
  （`lib/` 下 11 个文件各一份，另有 5 个 `isObject` 变体，例如 `lib/normalize.ts:3`）。
  代表：`lib/model-catalog.ts:71-101`（`isRecord` + `cleanString` / `optionalNonNegativeNumber` 逐字段窄化）、
  `lib/written-file-sources.ts:79-103`（hostile payload 解码，解析失败返回 `null` 而不抛）。
- 数组元素过滤用**内联类型谓词**而非 `as`：
  `.filter((entry): entry is string => typeof entry === "string")`（`lib/model-catalog.ts:100`）。
- `JSON.parse`（全仓 40 处）的标准形态是 `try { JSON.parse(...) } catch { return <安全默认> }`
  （`lib/models-config-store.ts:65-72`）。
- `globalThis` 上的跨模块注册表同样做守卫：`lib/auth-throttle.ts:40-57` 的 `getGlobalState` / `isState`
  （同型见 `lib/session-liveness.ts`、`lib/ask-user/persist.ts`）。
- 字面量联合来自 regex 捕获组时：先由受限正则或集合证明取值范围，再断言
  （`lib/written-file-sources.ts:139-141` 为正则约束；`:338-339` 为集合校验）。

## 常见写法

- 字面量联合 + `Set` / `includes` 校验：`lib/written-file-sources.ts:31,39-45`、
  `lib/theme.ts:13 isThemePreference`、`lib/tool-presets.ts:19 isToolPreset`、
  `lib/settings-navigation.ts:34 isSettingsSection`。
- 工具类型派生：`lib/agent-event-wire.ts:20-25` 用 `Exclude<...>` + 交叉 `&` 收窄 SDK 事件，
  `Omit<JsonMessageUpdateEvent, "assistantMessageEvent">`。
- `satisfies`（全仓 6 处）只用于「对象字面量同时满足外部类型 + 保留字面量推断」：
  `lib/session-reader.ts:740`、`lib/session-tool-selection.ts:51`、`components/ModelsConfig.tsx:738`、
  `hooks/useAgentSession.ts:523`、`app/api/app-update/route.ts:76`、`app/api/plugins/route.ts:284`。
- `as const`（AST 66 处）用于常量表 / 元组 / 需要字面量类型处
  （`hooks/useViewportHeight.ts:41` 的 `KEYBOARD_RETRY_DELAYS`）。
- `import type { ... }`（AST `ImportClause.isTypeOnly` 135 处）；混在一起时用内联 `type`（`import { A, type B } from "..."`）；
  转发类型用 `export type { A, B } from "./x";`（`lib/turn-written-files.ts:4-18`）。
- **可选字段判据（AST PropertySignature 中可选字段 1156 处、含 `| null` 的字段 155 处；两者可重叠）**：
  「文件 / 协议里会写 `null`」→ `| null`（`lib/types.ts:14-15` 的 `parentId: string | null`、
  `lib/git-types.ts:20-24` 的 `repositoryRoot: string | null`、
  `lib/pi-types.ts:15-19` 的 `percent: number | null`）；
  「我们这边可以不给」→ `?`（`lib/written-file-sources.ts:44-62` 的 `operation?` / `added?`）。
  `localStorage.getItem(): string | null` 也是保留 null 的实例
  （`lib/workspace-memory.ts:18`、`lib/file-explorer-state.ts:4`、`lib/settings-navigation.ts:16`、
  `lib/tool-preset-preference.ts:6`）。

## 禁用写法

- **`any`**（含 `as any` / `<any>` / `: any` / `any[]`）：全仓 0 处；
  ESLint `@typescript-eslint/no-explicit-any` 为 `error` 级兜底。
- **`@ts-expect-error` / `@ts-ignore`**：全仓 0 处；`@typescript-eslint/ban-ts-comment` 为 `error` 级。
- **非空断言 `!`**：现有 66 处，不是禁用语法；新增时应说明非空保证，优先显式窄化。
  `no-extra-non-null-assertion` / `no-non-null-asserted-optional-chain` 为 `error`，
  但它们只禁止多余断言与 optional chain 后断言，不等于禁止所有 `!`。
- **`enum`**：全仓 0 处。
- **schema 校验库**：不引入 zod / yup / io-ts / valibot / ajv / superstruct。
- **文件级 `/* eslint-disable */`**：全仓 0 处。豁免必须行内 + 指名规则 + 紧邻理由
  （例如 `lib/terminal-manager.ts:81` 的 `node-pty` 必须 `require`）。
- **`as` 不是禁用，而是「必须能回答为什么这里比编译器知道得更多」**（AST `AsExpression` 549 处，含 66 处 `as const`）。
  可接受场景：
  1. regex 捕获组 → 字面量联合（受限正则或 `Set` 校验，`lib/written-file-sources.ts:141,338-339`）；
  2. SDK 宽类型 → 本项目窄类型，代表适配层为 `lib/session-reader.ts` / `lib/rpc-manager.ts` /
     `lib/subagent-runtime.ts`；
  3. `globalThis` 的 symbol 索引（`lib/auth-throttle.ts:41`，TS 无法表达）；
  4. 访问运行时可能不存在的可选内建方法（`lib/session-liveness.ts` 的 `lease.timer`）；
  5. 判别联合收窄后的属性访问；
  6. CSS 自定义属性对象的 `as CSSProperties`（`components/SettingsUi.tsx:29-34`）。

  `as unknown as`（全仓 20 处）也只在上述适配边界或紧邻运行时校验处出现：
  `lib/rpc-manager.ts` 9 处、`lib/subagent-runtime.ts` 4 处、`lib/session-reader.ts` 1 处，
  其余为组件 / route 的少数点。不要在业务代码里新增。
- 当前配置下普通可选字段只需 `foo?: T`；`exactOptionalPropertyTypes` 关闭时，
  需要显式重置可直接赋 `undefined`。沿用对外类型契约时不要机械改写其联合类型。
