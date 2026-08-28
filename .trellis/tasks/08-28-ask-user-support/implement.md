# Implement: ask_user 提问支持

## 执行顺序

### Step 1 — 领域层 `lib/ask-user/`

- [x] `lib/ask-user/types.ts`：类型 + 限制常量 + `ASK_USER_ANSWERS_CUSTOM_TYPE`（照 design 3.1）。
- [x] `lib/ask-user/store.ts`：`PendingAskStore`（open/submit/cancel/cancelOpen/forgetSession/pendingAsk + `PendingAskValidationError` + `renderAskUserAnswersText`/`renderSupersededAskText`），逻辑移植自参考项目 `pendingAskStore.ts`。
- [x] `lib/ask-user/tool.ts`：`createAskUserToolDefinition`（`defineTool` + TypeBox schema + execute 返回 `terminate: true`），移植自参考项目 `askUserTool.ts`。
- [x] `lib/ask-user/index.ts`：导出。
- [x] `lib/ask-user/store.test.mjs` + `tool.test.mjs`：node:test 单测，覆盖状态机/校验/渲染/schema。
- 验证：`node --test lib/ask-user/*.test.mjs`

### Step 2 — 服务端集成 `lib/rpc-manager.ts`

- [x] 模块级 `isAskUserEnabled()`（`PI_WEB_ASK_USER`，默认 true）+ `getAskUserStore()`（`globalThis.__piAskUserStore` 单例）。
- [x] `AgentSessionWrapper` 新增 `openAsk` / `submitAsk` / `cancelAsk` / `voidOpenAskForUserMessage` / `pendingAsk`（见 design 3.2），`destroy()` 里 `forgetSession`。
- [x] `startRpcSession` 的 `createAgentSessionFromServices` 传 `customTools`（非 chatOnly 且启用时）。
- [x] `send()` switch 新增 `ask_submit` / `ask_cancel` 命令；`prompt` 命令入口先 `voidOpenAskForUserMessage`。
- [x] `get_state` 返回加 `pendingAsk`。
- 验证：`node_modules/.bin/tsc --noEmit`；`node --test lib/rpc-manager*.test.mjs`

### Step 3 — 共享类型 `lib/types.ts`

- [x] 新增 AskUser 类型族 + `ask.opened` / `ask.closed` 事件 + `get_state` 响应 `pendingAsk` 字段。
- 验证：`node_modules/.bin/tsc --noEmit`

### Step 4 — 客户端 hook `hooks/useAgentSession.ts`

- [x] `handleAgentEvent` 处理 `ask.opened` / `ask.closed`，维护 `pendingAsk` state。
- [x] 暴露 `submitAsk` / `cancelAsk`（`sendAgentCommand`），stale 时用返回 state 重水合。
- [x] 挂载 `get_state` 重水合 `pendingAsk`。
- 验证：`node_modules/.bin/tsc --noEmit`

### Step 5 — 客户端 UI

- [x] `components/AskUserCard.tsx`：表单卡片（选项/多选/自定义文本/部分作答/提交/取消），沿用 CSS 变量。
- [x] `components/ChatWindow.tsx`：渲染 AskUserCard（有 `pendingAsk` 时，输入框上方），接回调。
- 验证：`node_modules/.bin/tsc --noEmit`

### Step 6 — 端到端手动验证（dev server）

- [x] 提问→`get_state.pendingAsk` 出现卡片数据，agent 结束运行（streaming False）
- [x] 提交答案→`pi-web.ask.answers` custom_message 送达→模型被唤醒继续回答
- [x] 取消→模型被告知全未答（reason: cancelled）
- [x] 不答直接发消息→pendingAsk 清除+作废消息送达（triggerTurn false）且用户消息正常处理
- [x] stale 提交返回 `{ result: "stale" }`
- supersede 与 `PI_WEB_ASK_USER=0`：store 单测覆盖 supersede；env 开关为直白读取逻辑（重启 server 带 env 验证会打断 8505 dev，留待使用方确认）
- 触发方式：新会话提示模型"用 ask_user 向我提几个问题"（或临时在系统提示注入示例）。

### Step 7 — 收尾检查

- [x] `node_modules/.bin/tsc --noEmit`（0 错误）
- [x] 全量单测（608 个，0 失败）
- [x] 变更文件 lint（useAgentSession 的 2 个 react-compiler 报错为仓库既有问题，stash 验证）

### Step 8 — 后续增强（用户反馈）

- [x] 开关接入设置 UI：`lib/ask-user-settings.ts`（`~/.pi/agent/pi-web-settings.json` 的 `askUser` 字段，env `PI_WEB_ASK_USER` 优先）+ `app/api/settings/ask-user` GET/PUT + GeneralSettings 开关（ConfigSwitch + reload 提示/按钮，6 个单测）。
- [x] 注入方式从 `customTools` 改为 InlineExtension（`lib/ask-user/extension.ts`）：reload 会话后开关变更生效（端到端验证：关闭→新会话/reload 后工具消失；开启→恢复）。
- [x] AskUserCard 样式修复：把"其他"输入行改为与选项按钮同构（同缩进/边框盒/图标列宽），视觉对齐。

## 验证命令

```bash
node --test lib/ask-user/*.test.mjs
node_modules/.bin/tsc --noEmit
npx eslint lib/ask-user/*.ts lib/rpc-manager.ts lib/types.ts hooks/useAgentSession.ts components/AskUserCard.tsx components/ChatWindow.tsx
```

## 审查门禁

- Step 2 完成后：review customTools 注入与命令协议，确认 chatOnly / 关闭开关时行为不变。
- Step 4 完成后：review 事件与 stale 重水合逻辑。
- Step 6 完成后：验收标准逐条过，全部通过才进入提交。

## 回滚点

- 纯领域层（Step 1）失败：仅删除 `lib/ask-user/`，无其他影响。
- 服务端集成（Step 2）失败：回退 rpc-manager 变更（git checkout 该文件），功能整体不可用但会话正常。
- UI（Step 4/5）失败：回退 useAgentSession/ChatWindow/AskUserCard 变更，卡片不显示但服务端状态机完好。

## 参考文件（只读参考，不直接复制）

- `/home/xupeng/dev/personal/forked/pi-web/src/server/sessions/askUserTool.ts`
- `/home/xupeng/dev/personal/forked/pi-web/src/server/sessions/pendingAskStore.ts`
- `/home/xupeng/dev/personal/forked/pi-web/src/server/sessions/piSessionService.ts`（openAsk/submitAsk/cancelAsk/voidOpenAskForUserMessage）
- `/home/xupeng/dev/personal/forked/pi-web/src/client/src/components/AskUserCard.ts`
- `/home/xupeng/dev/personal/forked/pi-web/src/shared/apiTypes.ts`
