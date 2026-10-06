# 完成分类与结果可视判定的可行性复核

2026-10-06，只读研究；未修改产品代码、更新依赖或运行测试。

## 研究结论与边界

第一次窄研究建议 SDK 新增 finalized run 载荷。经反证复核，这不是常规功能的必需前置条件：当前锁定 SDK 1.0.0 的公开扩展 boundary 已提供 outcome 和持久化 messageEntryId，可在 Web 层建立只读 observer 与 run tracker。**特殊 post-run 异常的精确 run 归属仍有接口缺口；用户已明确接受首版只改 Web并披露此限制，不能宣称所有异常已严格覆盖。**

来源：子代理 `01a1108f-3985-7540-97bf-c3ca15bfb068`、反证复核 `01a11096-551d-7540-97bf-c3d3f1368a57`；主代理另核对 SDK agent-session.js 的 turn boundary、持久化与 prompt finally，以及 rpc-manager 的完成出口。

## 可复用的公开机制

- SDK 扩展 `turn_end` 提供 `outcome/messageEntryId/toolResultEntryIds`，`agent_before_settle` 提供 outcome（`node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:747-794`）。它不是公开 subscribe 的低层 turn_end，不能混用事件类型。
- SDK turn boundary 已解析持久化 entry id（同包 `dist/core/agent-session.js:475-503`）。无需调用 `_findPersistedMessageEntryId` 私有方法或猜文本/时间戳。
- 完整运行跨 retry、auto-compaction、before-settle continuation，到 `_runAgentPrompt()` finally 才 settled（同文件 `:1344-1437`）。
- settled dispatch 顺序为扩展 handlers → subscribe event → deferred actions；后续实际 run 必须获得新的 run identity（同文件 `:671-691`）。
- wrapper 当前 admission 也设置 completion flag，不能继续把 accepted 当成真实模型 run 证据（`lib/rpc-manager.ts:1004-1008,1074-1076`）。
- Stop/watchdog 在 abort 前设置 run-local 标记；ask 打开时留下暂停标记，不能在 settled 后仅查询 pendingAsk 当前值（`lib/rpc-manager.ts:522-543,584-609`）。
- 公开 extension binding 的 abortHandler 可统一标记扩展发出的 ctx.abort；不猴补 SDK 私有方法。

## Web-only 最小方案（风险范围已确认）

1. 新增纯 `agent-run-tracker` 与只读 inline `agent-run-observer`，在 loader 创建前装配，覆盖普通/Chat-only 创建分支并保留 subagent 抑制。
2. observer 同步注册事件，不发送消息、不 append、不改变工具或 prompt、不返回 boundary entries/continue；reload/dispose 的清理和 generation 守卫必须验证。
3. run 只由实际 agent_start 创建；settled 前重复 start/end 属于同一逻辑 run。按 wrapper generation/runSeq 存储最后 turn outcome、entry id、Stop、ask、可归属错误和 settled 状态。
4. settled 冻结候选，再关闭 active identity；延迟注入 run 单独编号。与直接 prompt 关联的 rejection 先 veto 再尝试提交，不能沿用当前先 finish 再报错顺序（`lib/rpc-manager.ts:1081-1099`）。
5. 正常最终结果通过公开 SessionManager.getEntry 校验结果 entry；completed 候选才进入持久化通知源。model stopReason `stop` 是正常结束，不是用户 Stop。
6. 错误后成功重试可以通知，最终 error/aborted、Stop、ask暂停及无实际run命令不通知。新 run 的错误不改变旧待查看记录。

## SDK 特殊异常保证缺口

- settled 在 finally 里，不是 Promise 最终成功屏障。边界/收尾抛错仍可能先发 settled。
- SDK 扩展发送调用 catch 用 `<runtime>/send_message` 或 `send_user_message` error hook 报错，但无 runId（同 SDK `agent-session.js:2667-2684`）。deferred 注入可能在入队时返回，实际异常沿上一轮外层 promise 回传（`:1746-1773`）。
- 无法严格区分“某个已 settled run 的收尾失败”“另一发送调用的 preflight 失败”和“SDK 捕获后仍正常完成的辅助扩展 handler 错误”。
- 不能用固定延时/microtask/setImmediate、最后一条 assistant、事后撤回或保守漏报冒充所有异常的严格分类。
- 若要求全部特殊异常都精确归属，需要可复现的 SDK finalized 契约，覆盖最终抛错和 deferred 子 run，不能只给当前 settled 加最后 turn outcome，也不能手改 node_modules。

## 结果已查看证据链

- 历史上下文 messages 与 entryIds 对齐（`lib/session-reader.ts:804-835`）；context API 支持 leafId/tail/before（`app/api/sessions/[id]/context/route.ts:12-24,34-53`）。
- 实时 message_end 尚无同步持久化 entry mapping；SDK 先发公开事件再 append message（SDK `agent-session.js:734-753`，`hooks/useAgentSession.ts:1965-2011`）。必须等待胜出的历史响应提交，不能以 optimistic 消息作为已查看证据。
- hook 需新增 committed-history view snapshot：sessionId/viewGeneration/loadedLeafId/ready/durableEntryIds；现有 activeLeafId 可能先于历史提交改变（`hooks/useAgentSession.ts:1021-1115,2365-2381`）。不能挪用 Trellis 私有 generation。
- ChatWindow 过程块与答案块可能使用同一个 entry id（`components/ChatWindow.tsx:1190-1255`）；应新增唯一完成结果 marker，不能 querySelector 第一处 data-entry-id 就 ack。
- 自动 ack 条件：前台可见且焦点在当前窗口、阅读表面未被面板覆盖、历史 ready、session/view generation匹配、对应结果 entry 在当前已加载分支、唯一结果节点真实进入可视区域、滚动恢复结束。长答案部分进入视区即可，不要求整条可见。
- 折叠/窗口化未挂载、历史分页未加载、兄弟分支无该结果、失焦/后台、全屏文件或对话框遮挡、旧 observer 回调都不能 ack（`components/ChatWindow.tsx:188-230,622-650,1058,1262-1272`，`components/AppShell.tsx:226,2047`）。
- 当前分支含 resultEntryId 即可，不强制 leaf 完全相等；后续子节点不应阻止旧结果被看见。
- ack 提交观察到的 completion revision；旧 R1 操作不得清新 R2。通知点击本身不 ack；深目标定位应复用 context 分页，不能借点击悄悄移动正在运行的 SDK leaf。

## 验证要求

- tracker 纯单测之外，用当前锁一致 SDK + 合成 provider/extensions 做隔离生命周期测试：retry/compaction/queued continuation、Stop/ask、无run handled、延迟/settled deferred注入及异常边界。
- 精确可视判定用真实 Chromium 检查：过程副本/答案、滚动/折叠/分页、隐藏和覆盖、分支、流式到持久化的过渡、旧 observer、R1/R2 ack 竞态。
- 这些验证尚未执行；没有将源码检查或空事件 mock 当作真实 SDK/浏览器验收。
