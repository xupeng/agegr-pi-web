# 实现边界与协作合同

2026-10-06：用户在最终规划摘要后明确选择批准并开始实现。当前分支 `feat/notification-center-sync`，起点 `e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`，task 已进入 in_progress。没有提交/推送/PR授权。

## 最小行为差与真实owner

当前只由浏览器侧栏维护本地运行差分待查看，无法跨设备统一或聚合pending。新增服务端完成采集/保存和原pending只读投影，所有UI共享通知snapshot；真正的完成证据归SDK boundary/run tracker，交互生命周期仍归原wrapper/ask owner，结果已查看归committed-history和唯一结果DOM。

## 文件分工

- Runtime实施代理：`lib/agent-run-tracker.ts`、`lib/agent-run-observer.ts`、其测试，以及 `lib/rpc-manager.ts` 的只读observer、run分类、pending快照和invalidations。不得改API/UI/持久化文件。
- 服务端实施代理：`lib/notifications/{types,store,persist,runtime}.ts`、测试、`app/api/notifications/**`、会话DELETE通知清理；不得改rpc-manager或客户端/UI。
- 主代理/后续客户端代理：客户端共享store/hook、中心、AppShell、SessionSidebar、ChatWindow/useAgentSession可视ack、三语与浏览器验收。
- 验证代理：独立主磁盘worktree、干净npm ci依赖与baseline，正式报告放任务research。不改产品源、不提交。

实现前各owner自行加载相关真实规范与docs/agents，优先codegraph并注意陈旧索引。所有文件修改使用apply_patch；不跨owner编辑。

## 跨层固定接口

由服务端代理拥有 `lib/notifications/types.ts`，客户端可导入（仅type、无node/SDK runtime）：

- `NotificationCompletionInput`：`sessionId`, `runIdentity`, `resultEntryId: string | null`, `completionLeafId: string | null`, `completedAt: string`, `summary: string`。来源默认为live，导入由store内部标legacy。
- `NotificationCompletionItem`：`kind: "completion"`, `id`, `sessionId`, `revision`, `runIdentity`, `resultEntryId`, `completionLeafId`, `timestamp`, `summary`, `origin: "live" | "legacy-import"`, 以及项目/会话显示元数据。
- `NotificationAttentionItem`：`kind: "ask" | "extension"`, `id`, `sessionId`, `timestamp`, `summary`, `requestId`, 可选`method`，以及同样显示元数据。不接受ack。
- 共有显示元数据：`projectKey: string`, `projectName: string`, `sessionName: string`（缺失时有可见占位，不能伪称已删除）。
- `NotificationItem` 为两者联合；`NotificationSnapshot`：`instanceId`, `epoch`, `sequence`, `items: NotificationItem[]`, `storageHealth: "ok" | "degraded"`。服务端可加受限health reason，但客户端不依赖任意错误字符串。
- `NotificationRuntimeSession`：`sessionId`, `cwd`, `pendingAsk: PendingAskUser | null`, `extensionRequests: Array<{request: BlockingExtensionUiRequest; requestedAt: string}>`。SDK/React对象不得进入JSON DTO。

服务端 `lib/notifications/store.ts` 公开窄函数：

- `recordNotificationCompletion(input: NotificationCompletionInput): void`：同步登记，不让持久化失败抛到agent；degraded/重试归store。
- `invalidateNotifications(): void`：推进sequence并通知全局订阅，供原owner更新pending/生命周期；不读registry。
- `isNotificationSessionDeleting(sessionId: string): boolean`：提交守卫。
- `forgetNotificationSession(sessionId: string): void`、`beginNotificationSessionDeletion(ids: string[]): () => void`：删除流程/恢复守卫，服务端代理接线。
- 单例路径与写入只有调用时惰性初始化，不得import模块即触碰真实agent目录。

Runtime代理在 `lib/rpc-manager.ts` 新增：

- `getRpcNotificationSnapshots(): NotificationRuntimeSession[]`：仅alive且非suppressed会话，包含pendingAsk=null的否定态；不重建、不持lease，不主动查盘。
- wrapper pending请求时间由原登记/关闭点维护，custom重绘不变请求identity；所有原owner变更调`invalidateNotifications()`。

服务端runtime负责 `getNotificationSnapshot(): Promise<NotificationSnapshot>`，路由使用该函数。store不import rpc-manager，避免循环；runtime可以import rpc-manager。

API合同：GET `/api/notifications`直接返回snapshot；POST `{type:"ack", id, revision}` 或 `{type:"ack_many", items:Array<{id, revision}>}` 或 `{type:"import_legacy", instanceId, sessionIds}`，成功返回 `{snapshot}`（允许附加counts/result，不能隐式全清）；错误非2xx、state不假成功。SSE只发送版本invalidation，客户端重取snapshot，约2秒可见兜底。

## 不做与等价性证明

不升级SDK/pins，不改交互提交，不更换状态/测试库，不全量加载会话摘要、不启动所有会话、不把中心查看变成ask取消。不偷偷扩大特殊收尾异常保证。

拆除local unread只改变权威源和查看规则，原running轮询/目录结构刷新继续；observer没有工具、资源、prompt或continuation输出。用现有回归和真SDK离线fixture证明这些边界，不能拿源码推断当运行验收。

## 工作区与收尾

开发cwd为主仓库；验证worktree位于主磁盘相邻专用目录，不使用/tmp或自动清理缓存放源码。首次shell验证TMPDIR，runtime测试隔离HOME/PI_CODING_AGENT_DIR，禁止live MCP/agent写入；服务需记录精确PID/日志，最终停止自有服务并git worktree remove。唯一报告/必要截图保存在任务research，临时产物按pi-tmp-run清理。不得运行next build，不裸git push，不提交或归档。
