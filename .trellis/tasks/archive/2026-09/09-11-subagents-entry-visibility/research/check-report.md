# Independent check report

检查时间：2026-09-12（UTC+08:00）

## 结论

已独立读取任务 PRD、设计、实施计划、`check.jsonl` 中的规格/研究文件，并审查当前全部 tracked 与 untracked 变更。检查中发现的问题均已在任务范围内直接修复并补充测试；当前没有已知的范围内未解决 finding。

本次检查没有修改 `.pi/extensions/trellis/**`、Trellis producer/协议、会话关系/registry/list-version、全局配置或真实用户会话数据；没有执行 `next build`、commit 或 push。

## 已修复 findings

1. **Decoder 边界与诚实截断**
   - 对工具名增加精确 `trellis_subagent` gate；未知/错误工具仍走普通 tool-result 行为。
   - runs 只检查前 100 项，tool traces 只检查最后 32 项；身份字段超过 256 字符直接拒绝而不是截断碰撞，持久化 `entryId` 也改为有界可选值。
   - usage 计数只接受非负安全整数，cost 只接受有限非负数；缺失或全无效 usage 不伪造零值。
   - prompt/final/tails/error/tool args/agent/model/thinking/tool name 均有界；label 在 `trim` 前先切片，避免超长不可信字符串触发无界扫描。
   - 增加 label/tool-name/tool-args/UI aggregate budget 的额外截断标记；界面区分 producer 可能已截断与 Pi Web 进一步截断。

2. **Evidence 排序与 history watermark**
   - reducer 以事件到达顺序决定展示顺序，不再信任 producer timestamp。
   - canonical message 证据优先于 persisted history，persisted history 优先于 provisional tool-end/partial；晚到 partial 不会把持久化终态降级为 running。
   - history 响应只清除其 watermark 覆盖的 overlay；请求发出后到达的 final overlay 会保留。
   - event 侧 omission/truncation 使用独立 watermark：晚到旧 history 不会清除新 omission，更新且覆盖它的完整 history 可以清除旧标记。
   - reconnect 将仅存在于内存的 overlay 标为 stale，并收回上一条 SSE 的临时 call ownership。

3. **历史恢复与有界分支投影**
   - 投影从已加载 entries 构建一次 ID map，只遍历请求 leaf 的 ancestor path，显式 root/未知 leaf/cycle 不回退到其他分支。
   - 兼容 Pi 持久化 assistant tool call 的 `id`/`name` 形状以及 pi-web normalized 形状。
   - 结果独立于默认 50 条 chat page；初始 detail 与非分页 context 响应最多返回 100 条 record，并在序列化前应用 512 Ki 字符预算。
   - branch tool-call ownership 仅保留最新 100 个 ID，反向遍历并提前停止，去重集合不再随完整历史无界增长；record retention 满额并确认有额外记录后也提前停止。

4. **会话、分支、请求与 SSE ownership**
   - `loadSession` 的 success/404/error/finally 均受 mounted、真实 session ID 和 request sequence 守卫；全会话加载使旧 pagination 失效。
   - `loadContext` 记录 request sequence、view generation、requested leaf 和 event watermark；branch replacement 在 await 前同步清空旧 records/call ownership，并使旧全会话请求失效。
   - page-up 只追加 chat history，不重算 Trellis scope；A-B-A、X-Y-X 及旧 404/finally 无法回写当前视图。
   - live call ID 只从当前分支已接受的 assistant message/tool-call delta 获得，不再信任可能缓冲的 `tool_execution_start`。
   - reconnect 在已有 history 请求或 parent 仍 active/streaming 时不启动第二个会话读取，避免取消含 state 的初始响应或覆盖正在 streaming 的 chat；终态 settlement 再做 durable reconcile。
   - historical branch 上收到 background settlement 时刷新当前 branch context，不再调用 head `loadSession` 把界面跳回最新 leaf。

5. **AppShell owner/cleanup 与现有行为**
   - ChatWindow publication 使用单调 owner；旧 owner 的 late cleanup 不能清除新 owner snapshot，且 AppShell 始终再次按当前 selected session ID 过滤。
   - Agents entry 的唯一条件改为 built-in children 或当前 parent/view 的有效 Trellis records；计数为 built-in children + retained Trellis runs，不计 main row。
   - Trellis-only 时保留 selected session 作为 main-row fallback；records-only 面板不再误显示 `No matching agents`。
   - built-in listbox、session navigation、status/running count/search 保持原语义；Trellis row 只本地展开，不发 session URL、navigate、continue、steer、fork 或 stop 请求。

## 主要变更文件

- 数据与历史：`lib/trellis-subagent-records.ts`、`lib/trellis-subagent-history.ts`
- API：`app/api/sessions/[id]/route.ts`、`app/api/sessions/[id]/context/route.ts`
- 生命周期：`hooks/useAgentSession.ts`、`components/ChatWindow.tsx`
- Shell/UI：`components/AppShell.tsx`、`components/AgentSessionPanel.tsx`、`components/TrellisSubagentRecords.tsx`
- 文案：`lib/i18n/messages/en.ts`、`lib/i18n/messages/zh-CN.ts`、`lib/i18n/messages/zh-TW.ts`
- 行为测试：Trellis decoder/reducer/history/persistence/component/hook tests、route/wire/mobile-toolbar tests、`e2e/subagents.mjs`
- E2E 接入：`package.json`、`e2e/README.md`、`e2e/run.mjs`（仅增加可选本机 Chromium executable path）

## 验证结果

### Node tests

- Focused Trellis suite：**68/68 passed**。
- 相关兼容/行为集合（normalize、wire/stream/connection、family、built-in panel、toolbar、route、hook、Trellis）：**150/150 passed**。
- 隔离全量 suite：`PI_CODING_AGENT_DIR=$(mktemp -d)`，**1164/1164 passed**；临时目录在命令结束时删除。

### Typecheck / lint / artifacts

- `node_modules/.bin/tsc --noEmit --incremental false`：**passed**。
- `git diff --check`：**passed**。
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/09-11-subagents-entry-visibility`：**passed**。
- `npm run lint`：仍为 **16 errors**，全部是既有 `react-hooks/preserve-manual-memoization`：`ChatInput.tsx` 7、`ChatMinimap.tsx` 5、`SessionSidebar.tsx` 2、`useAgentSession.ts` 2。隔离 `HEAD` 运行同一命令也是 **16 errors**（同文件/同规则；hook 行号仅因本任务插入代码而移动），因此本任务没有新增 lint finding。

### Browser E2E

在仓库同一文件系统的 disposable source copy 中运行，使用独立 `.next`、临时 `PI_CODING_AGENT_DIR`，且没有接触/停止原 checkout 中的服务。Playwright 本地缺少其期望的 Chromium revision 1243，因此通过新增的可选 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 使用机器已有 revision 1234。

`npm run test:e2e:subagents`：**passed**。

- 1280x800：records-only、built-in-only、mixed、empty、branch、read-only interaction 全通过。
- 390x844：同一视图/交互矩阵全通过，移动 toolbar More-controls 路径正常。
- Trellis detail row 使用原生按钮完成 focus + Enter 展开验证；桌面与移动 viewport 均通过。
- 行为覆盖：首屏无 SSE 的 >50-entry durable restore、built-in navigation、A-B-A delayed success、A-B-A delayed 404/finally、X-Y-X out-of-order context、partial -> reconnect stale -> tool-end/message final、historical branch settlement 不回 head、Trellis run ID 不被当作 session URL。
- 浏览器 page/console error 断言通过；测试启动的 server 与临时 agent data 均已清理。

仓库原有 `node e2e/run.mjs` 在变更隔离副本和隔离 `HEAD` 上得到相同结果：先通过 3 个既有阶段，然后都在 `e2e/chat-appearance.mjs:88` 的短 Settings panel 最后一个 language option hit-test 失败。该失败在 `HEAD` 可复现，且与本任务文件无关，因此没有报告为全量 E2E 通过，也没有在本任务中修改该基线。

## 残余风险 / 非阻塞项

- Trellis partial 本身不持久化；崩溃后若没有 final tool result，只能在当前内存 view 中显示 stale snapshot，完整 reload 后可能不可用。这是 producer/runtime 约束，按批准范围不修改。
- 新 adapter 对输出和新增投影工作做了边界控制，但既有 raw SSE/JSON 解析仍可能先接收 producer 的大 payload；transport/producer 级限制不在本任务范围。
- 原研究确认的 built-in short-lifecycle session-list sampling gap仍为 deferred；本适配器没有宣称修复全部历史可见性问题。
- 仓库原有 browser E2E 的 chat-appearance 基线失败仍需独立处理；不影响本任务专项 desktop/mobile E2E 已通过的结论。
