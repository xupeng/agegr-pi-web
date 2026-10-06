# 实现评审与修正记录

本记录只汇总源码评审、定向测试和浏览器发现。最终功能覆盖以 `verification.md` 及正式运行日志为准，不把只读评审当作浏览器验收。

## 独立只读评审

评审覆盖 tracker/observer → rpc commit guard → persistence/runtime → API → shared client → AppShell/navigation → ChatWindow proof/visibility，未修改源码或运行产品服务。提出三项可举证问题：

1. **P1：Markdown 容器矩形不是正文证据。** CodeBlock 的语言/Copy 栏头或 Mermaid 加载/错误占位可落入容器交集，答案实际正文尚未可视却触发 ack。
   - 修正：`lib/notifications/visible-content.ts` 使用文本 Range、已加载图像/已渲染图形与真实命中校验；`MermaidBlock.tsx` 标记辅助 UI；忽略动作按钮/行号/错误/加载/reveal 元素。observer 的 rAF 仅节流可视检测，不参与尾部跟随。
   - 定向证据：DOM API peer 测试检查栏头不创建 Range、首行可视、文本空白边界、遮挡；实际像素仍需 Chromium。
2. **P2：通知跳转沿用搜索 first-text，可能定位过程前言。** 同 entry 的长过程文字＋thinking＋最终答案会展开前言而不去真正结果。
   - 修正：`searchTarget.notificationResult` 显式保留来源；ChatWindow 用 `splitFinalAssistantBlocks()` 的 answer text 做目标；常规搜索 blockIndex 不变。不调用 SDK navigate_tree。
3. **P2：关闭中心后重开，迟到元数据导航可复活。** Ctrl+Alt+N/显式 context 路径未同步退休导航，旧请求借新的中心开放态改选 session/URL。
   - 修正：统一 `invalidateNotificationNavigation()`，在所有显式 context 变更、panel 进出及关闭路径执行；AbortError 静默，真正错误保留。不把状态 updater 的延后执行当作同步退休。

## 浏览器捕获的初始化回归

首次修正 P3 时 callback 定义位置晚于一个 effect 的 eager dependency array，Next SSR/Chromium 实际报 TDZ `ReferenceError`。此前单测/typecheck 成功不能替代真正组件加载。证据保留在 `validation-logs/browser-2026-10-06T10-54-47-440Z/`。

已把 refs/helper 放到 activeTopPanel state 后、首个 eager 使用前；`AppShell.notification-order.test.mjs` 固定声明次序与 updater 外同步退休。旧 source 的五个浏览器核心场景通过不作为此修正后 source 的通过证据。

## 额外失败路径检查

源码检查发现 durable ack 写失败会触发 health invalidation，新快照产生 completion 对象，从而 observer 重绑并绕过局部 retry timer，可能形成高频 POST 反馈。

已加入纯 `NotificationViewAckGate`：同 revision 在跨 effect 重绑时共享 in-flight/失败退避/成功发送资格，新 R2 独立，旧 R1 完成/失败不覆盖 R2。新增纯测试覆盖；服务端仍是已读权威，gate 不清列表或制造 ack 成功。

独立复核确认 P1/P2 已关闭、P3 的声明次序和同步退休修正有效，又捕获 `handleAutoName` 关闭 panel 时遗漏退休。已补同一 helper 调用与依赖，并以定向断言锁住顺序。复核未执行产品门禁/浏览器，不把它写成运行通过。

## 门禁与边界

- 早期 owner spot tests 使用原依赖，不能冒充正式 lock 门禁。
- 主仓干净 `npm ci --include=dev` 后，初始 baseline 等价环境门禁为 2989 项全过。
- 三项修正和 TDZ 修正后又有 3000 项全过；新增 ack-gate 后需最终重跑，最终计数/退出码见 verification。
- 未升级 SDK/pins、未改 package/lock，没有 monkey-patch/private SDK 方法，没有 commit/push/PR/workflow。
- 特殊 deferred/post-run 异常精确归属限制、ordinary extension 重启恢复限制和未执行平台覆盖仍需披露。
