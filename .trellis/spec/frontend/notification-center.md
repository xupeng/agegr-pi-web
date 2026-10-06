# 单实例跨项目通知中心

## 1. 范围与触发点

通知属于同一 pi-web 实例，不属于某个项目、浏览器 localStorage 或每会话 SSE。完成待查看与待交互是两个不同状态所有者：前者由 Web 服务端维护，后者只读投影原 ask/extension 状态机。查看中心不回答、取消或关闭交互，不创建 AgentSession，也不续租所有会话。

入口与列表：`components/AppShell.tsx`、`components/NotificationCenter.tsx`、`components/SessionSidebar.tsx`。完成证据：`lib/agent-run-observer.ts`、`lib/agent-run-tracker.ts`、`lib/rpc-manager.ts`。持久化与聚合：`lib/notifications/{types,store,persist,runtime}.ts`。正文确认：`hooks/useAgentSession.ts`、`lib/notifications/{viewed-result,visible-content}.ts`、`components/ChatWindow.tsx`。

## 2. 签名

```ts
recordNotificationCompletion(input: NotificationCompletionInput): void
getNotificationSnapshot(): Promise<NotificationSnapshot>
beginNotificationSessionDeletion(ids: string[]): () => void
forgetNotificationSession(sessionId: string): void
getRpcNotificationSnapshots(): NotificationRuntimeSession[]

startNotificationClient(): () => void
refreshNotifications(): Promise<void>
acknowledgeNotification(item: NotificationCompletionItem): Promise<void>
acknowledgeAllNotifications(): Promise<void>

computeNotificationCenterBox(
  anchor: NotificationAnchorRect | null,
  viewport: { width: number },
  fallbackTop: number,
): NotificationCenterBox // { left, top, width }
```

`useNotifications()` 只订阅稳定共享 store，返回 `{snapshot, loading, error, connected}`；只有 AppShell 调用 `startNotificationClient()`。SSR 使用固定空快照，禁止在模块导入或 render 中访问 window、连接 SSE、读取真实 agent 目录。

## 3. 请求、响应与存储契约

### API

`GET /api/notifications` 直接返回：

```ts
{
  instanceId: string; epoch: string; sequence: number;
  storageHealth: "ok" | "degraded";
  items: NotificationItem[];
}
```

完成项有 `kind: "completion"`、`id: "completion:<sessionId>"`、opaque `revision`、`runIdentity`、`resultEntryId`、`completionLeafId`、`timestamp`、`summary`、`origin`。每会话最多一条，新正常完成替代旧条目；开始新 run 不清旧条目。ask/extension 项有自己的 `requestId`，没有可确认的 completion revision。所有项带 `projectKey/projectName/sessionName`。

`POST /api/notifications` 只接受下列命令，成功返回 `{snapshot}`：

```json
{"type":"ack","id":"completion:SESSION","revision":"OBSERVED_REVISION"}
{"type":"ack_many","items":[{"id":"completion:SESSION","revision":"OBSERVED_REVISION"}]}
{"type":"import_legacy","instanceId":"OBSERVED_INSTANCE","sessionIds":["SESSION"]}
```

批量上限 200，body 上限 128 KiB。token 长度最多 256 且不含控制字符；sessionId 长度最多 128，仅字母、数字、下划线和连字符。未知字段、非 completion ack ID、坏 JSON 拒绝。批量客户端在操作开始时冻结所有 `(id, revision)`，分批提交也不能重新采样；R1 操作不能清 R2。所有响应 `no-store`。

`GET /api/notifications/events` 只有 `connected` / `invalidation` 版本事件，没有消息正文、每会话订阅或 liveness lease。客户端在正常可见页面以 2 秒轮询兜底，online/visibility 恢复触发协调；新 epoch/请求 generation 不能被旧迟到响应回退。

### 文件与恢复

`<getAgentDir()>/pi-web-notifications.json` 使用版本 1、0600 原子替换、单进程惰性 globalThis store，保存持久 `instanceId`、completion 数组、per-session `runIdentity` watermark。启动 epoch 不持久化。完成记录上限 10,000，watermark 上限 100,000，文件上限 40 MiB。

完成写入失败不能抛入 agent 执行：保留内存新结果、标记 degraded，有限退避重试最新状态。ack 只有原子持久化成功后才清内存/回成功；坏文件和未知版本失败关闭，禁止覆盖唯一原件。提交完成记录后的正常重启保留 revision；崩溃发生在落盘前不承诺 exactly-once。

旧 `pi-web:unread-session-ids` 只是迁移输入，不再是权威状态。按当前 instance 导入经过定向存在性/子代理过滤的 ID，watermark 防止另一设备旧 key 复活已查看记录。legacy 项不伪造运行成功或结果 entry（其 result/leaf 可为 null）；没有结果证据时只能显式标已查看或被新正常完成替代。

ask 镜像沿用原 best-effort 恢复；alive wrapper 的 `pendingAsk: null` 否定态覆盖旧镜像。普通 extension UI 请求不承诺跨服务重启恢复。元数据仅定向读取相关会话，带缓存、单飞和并发上限 4；读失败显示不可用信息，不能当作已删除。

### 运行与删除

只以真实 `agent_start` 建立 run identity；公开只读 `turn_end` 与 `agent_before_settle` 提供 outcome、persisted message entry 和终态证据。`agent_settled` 是收敛点，不是无条件成功证明。direct prompt 候选等待 promise 完成，拒绝可 veto；retry/compaction/queued continuation 收敛，settled 后 deferred run 使用独立 identity，候选按 run 顺序释放。

Stop、watchdog、公开 abort、ask pause、最终 error/aborted/length、无真实 run 的 handled command、独立 bash 和手动 compact 不制造正常完成。Chat-only 装配相同 hidden observer，但不新增工具/资源/prompt；内部子代理和 Trellis 记录保持抑制。特殊 deferred/post-run 扩展异常缺少精确公开 run 归属，是已接受的 Web-only 边界，不能宣称严格失败分类或偷偷改 SDK pins。

写完成前检查当前 registry identity、alive、抑制与 deleting。删除先设 guard，再仅按实际成功删除集合 forget，部分失败保留未删项；迟到旧 wrapper 回调不能重建幽灵通知。

### 可视结果确认与导航

`NotificationHistoryScope` 有独立 `viewGeneration`、session/leaf、ready 和 proven entry/source pairs，不借用 Trellis generation。替换/刷新开始即失效，迟到响应不得提交；缓存中的 optimistic messages 不成为 proof。`bindNotificationHistoryProof()` 只绑定同 entry 的 fresh authoritative 完整内容或原 canonical object identity；跨 leaf 不保留旧 proof。page-memory cache 单独携带 `notificationHistory`，新挂载仍等 fresh 读取确认后 ready。

只有实际最终答案 text block 得到 `data-notification-result-entry-id` marker，过程副本不复制该资格。确认必须同时满足当前 scope identity、可见/有焦点文档、无遮挡 reading surface、不是滚动恢复中，以及 payload 实际像素进入 scroller/viewport。

`visible-content.ts` 读取真实文本 Range/已加载图像和已渲染图形的矩形并验证 `elementFromPoint`。代码语言/Copy 栏头、行号、Mermaid loading/error、模型标签、reveal 按钮不能提供证据；`MermaidBlock.tsx` 通过 `data-notification-nonresult` 标识辅助 UI。不得仅观察整个 Markdown 容器、通用 `[data-entry-id]` 或 tail sentinel。

可视 ack 的 `NotificationViewAckGate` 跨 observer 重绑保持同 revision 的 in-flight 与 2 秒失败退避；存储失败引起 SSE health invalidation 时，不能重绑后立即再次 POST 形成反馈风暴。该 gate 只节流请求，不是已读权威，新 revision 不继承旧失败/成功状态。

通知来源通过 `searchTarget.notificationResult` 保留定位语义，选择 `splitFinalAssistantBlocks()` 的实际 answer block，不沿用普通搜索的 first-text 前言。分页寻找当前视图中的结果，不为查看调用 `navigate_tree`；另一分支或无法加载时保留待查看并提示。所有离开中心/显式切换 context 的路径同步退休导航资格；中心关闭后重新打开不恢复旧请求 identity。

### 面板定位：真实对话列锚点

- `AppShell.notificationAnchorRef` 挂在工具栏下的对话内容列（`data-notification-anchor="chat-column"`），通过 `anchorRef?: RefObject<HTMLElement | null>` 传给中心。该列排除左侧栏及桌面右侧文件分栏；不是消息正文的 max-width，也不是铃铛或整个 viewport。
- `NotificationCenter` 在 layout effect 中测量 `getBoundingClientRect()`，用 `ResizeObserver` 与 `window.resize` 跟随尺寸/布局变化；disconnect/remove 成对。SSR 与首个客户端 render 不读 window，未测量时 CSS 使用视口居中兜底。
- 桌面最大宽度 460px，两侧间距 12px。有效可见列的 padded bounds 与 viewport padded bounds 取交集，面板宽度不得超过该交集；通常为 `min(460, columnWidth - 24)`，水平中心对齐列中心，部分离屏时才按可见边界夹住。**禁止用最小宽度 floor 撑出对话列**，也不能从 localStorage 的侧栏宽度猜坐标。
- 无锚点、零宽、完全离屏或非有限坐标时回退视口居中；有正宽可见列仍优先列边界。小于24px列无法同时满足两个12px间距，helper 返回零宽且原点在可见列内，不承诺该不可达布局的控件可用性。现有 panel resizer 的 min/reclamp 不替代 helper 的边界合同。
- `--notification-center-{top,left,width,shift}` 只用于面板定位，top 为对话列顶部（工具栏下方），不是垂直居中；保持受约束滚动链。header/action 允许必要折行、收缩，关闭目标仍44×44。
- ≤640px 保持原全屏/safe-area/viewport-height，媒体查询必须同时重置 `transform: none !important`，不能将桌面居中位移带进手机。native dialog、Escape/焦点返回、导航退休与通知状态逻辑不因布局改变。

## 4. 验证与错误矩阵

| 条件 | 行为 |
| --- | --- |
| 外站/不可信请求 | 403，不修改状态 |
| 错 Content-Type / 超 body / 坏命令 | 415 / 413 / 400 |
| import instance 不匹配 | 409，不导入 |
| snapshot 不可用 / ack 持久化失败 | 503，客户端保留旧列表并显示错误 |
| 其他命令失败 | 500，可安全重试 |
| completion 写失败/坏存储文件 | degraded；不打断 agent，不假 ack |
| R1 迟到、pending 被当作 ack | R1 不清 R2；pending ack 拒绝 |
| 缺失元数据/失焦/遮挡/结果未挂载 | 不自动 ack，保留事项 |
| 有效窄对话列/左右分栏同时展开 | 宽度受列与viewport交集约束，不用min-width撑出列 |
| 无可见锚点/≤640px viewport | 视口居中兜底/原手机全屏，不出现桌面translate残留 |

## 5. Good / Base / Bad

- Good：两个独立浏览器 context 打开不同项目；一端确实看见持久化最终正文，按观察 revision 清除，另一可见设备正常网络下 3 秒内更新。
- Base：无选中项目也能打开中心；同会话旧完成与当前 ask 共存，项目标记按 session 去重，中心批量操作只清 observed completion。
- Bad：running→idle 当作成功；选会话就清未读；旧响应借重开中心复活；代码工具栏可见即全实例标已读；修改 SDK 私有方法或 pins。
- 布局 Bad：固定 `right: 12px`，关闭侧栏后不移动；或 `max(280, columnWidth - 24)` 在窄列越界。Correct：测量真实列，在其 padded bounds 内居中，手机单独全屏。

## 6. 必须覆盖的测试

- `lib/agent-run-*.test.mjs`：正常/失败、直接 veto、retry/continuation/deferred、Stop/ask、释放顺序；integration 必须跑真 SDK 离线 provider，而非仅源码字符串。
- `lib/notifications/{persist,store,runtime,client}.test.mjs`、`app/api/notifications/**`：落盘/损坏/重试、revision 竞态、迁移 watermark、live 否定 pending、HTTP 安全与响应倒序。
- `lib/notifications/{viewed-result,visible-content}.test.mjs`、ChatWindow/AppShell 回归：canonical identity、过程副本、代码/图形辅助 UI、关闭重开迟到导航、URL 恢复与尾部跟随。
- 真实 Chromium：双独立 context、≤3 秒同步和 SSE 禁用兜底、正常重启、正文/代码栏头/遮挡/后台、notification 最终答案定位、mobile 390px fullscreen/44px/Escape/焦点；单测/源码断言不能替代浏览器证据。
- 布局回归：`components/NotificationCenter.test.mjs` 的纯几何矩阵与 ref/observer/CSS 合同；`e2e/notification-center-layout.mjs` 真实 Chromium 的667/800/1024/1280、641紧凑列、侧栏开关/拖宽、左右同时展开、open期间跨640断点往返、长列表滚动/关闭、390全屏44px。常规桌面要求中心误差≤2px、宽度≤460且≤列宽−24、左右各≥12px、工具栏下方；150px反例必须是126px面板，不能仅断言“280px在viewport可见”。
- 真正 SDK/API 运行态验证隔离 HOME 与 PI_CODING_AGENT_DIR；验证依赖先 `npm ci --include=dev`，不调用真实付费 provider/MCP，不在开发 checkout 跑 `next build`。仅前端布局可复用已有用户 dev 服务，但须独立浏览器profile、block ServiceWorker、全部 `/api/**` 本地fixture兜底且非GET拒绝，不能写真实agent目录。这种浏览器证据不冒充后端/同步/ack验收；Safari/iOS/Windows 未运行就单独披露。

## 7. Wrong vs Correct

```ts
// Wrong: arbitrary wrapper visibility/selection clears shared state.
if (selectedSessionId === item.sessionId) markRead(item.id);

// Correct: only a foreground, current canonical final payload is evidence;
// the server still compares the captured revision before durable mutation.
if (currentHistory === observedHistory && actualAnswerPayloadVisible) {
  await acknowledgeNotification(observedCompletion);
}
```
