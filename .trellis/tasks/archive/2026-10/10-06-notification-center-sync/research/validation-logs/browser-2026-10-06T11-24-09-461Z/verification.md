# 最终独立 Chromium 验证

运行：2026-10-06 11:24:09.461–11:26:17.304 UTC。结果 **14 pass / 1 not-run-environment / 0 fail**，进程退出 0。不是全部验收矩阵通过声明。

使用最新 candidate checkout、真实 Next dev/public routes、SDK 1.0.0 offline faux provider、两个独立 Chromium context；真实 Notification permission 与 Permissions API 均 denied。无真实 HOME/agentdir、付费 provider、MCP、内部 debug endpoint、人工通知 snapshot/SSE、焦点/visibility JS stub、next build 或依赖重装。ask pending 的协议 peer 是仓库最小 protocol fixture，不是完整真实 ask_user 插件。

## 实际通过

| 场景 | 实际断言 |
| --- | --- |
| global-aggregation | 跨项目完成/待交互、pending-first、摘要/打开中心不 ack、独立 localStorage、侧栏状态 |
| revision-bulk-fallback | 冻结 R1 批量与 SDK R2 竞态、旧单条 revision 不清 R2、pending 不清、禁全局 SSE 的独立 B 更新 |
| new-run-preserves-old | 真 SDK 新 run 不清旧 completion |
| result-center-gate | 中心遮挡不 ack，关闭后实际 final marked markdown 才 ack |
| result-settings-long | 设置遮挡不 ack，长正文真实局部可见后 ack |
| result-file-fullscreen | 全屏真实文件覆盖不 ack，关闭覆盖后 ack |
| pagination | 360 raw padding 超过 300 raw-entry 首次读取上限；真实 tail API 确认 result absent/hasMore，再导航分页定位/正文 ack |
| process-final-target | 同 entry process 与 final：仅 process 可见不 ack，通知定位实际最终答案 |
| code-only-body | 语言/Copy 栏头独自可见不 ack，首行实际 pre 正文可见后 ack |
| mermaid-loading-error | 真实动态 loading 与实际 Mermaid parse error 不 ack，仍保留 completion |
| metadata-navigation-retired | metadata 延迟跨 CtrlAltN；中心重新打开后旧目标不复活 |
| sibling-busy-mobile | 不隐式 navigate_tree，兄弟 busy 保留原结果并提示；显式目标 URL commit 与 stale-memory reload 正确；running 与 unviewed 共存；390px fullscreen、44px close、Escape 不 Stop、真实 focus 返回 |
| healthy-sse-sync | 新独立 B，真实健康 text/event-stream 响应，真实 bulk ack 后另端更新 |
| browser-close-restart | 关闭实际浏览器、正常关闭/重启同 agentdir 的 Next、新独立 contexts；instance/revision/已 ack 状态持久化，epoch 更新 |

## ≤3 秒量测

从真实 POST 成功响应观察时刻到各端 DOM 更新：

| 网络 | 本端 | 独立另端 |
| --- | ---: | ---: |
| 健康全局 SSE | 46.806ms | 76.257ms |
| B 禁全局 SSE fallback | 82.333ms | 172.776ms |

## 最终 source 与限制

`report.json` 中 monitored productHashesStart/End 相同、sourceChangedDuringRun 为空；结束后当前产品文件仍匹配这些 hash。`viewed-result.ts` SHA-256 为 `f0c45348e7f7e191c69cc0233faf901a3bf4778ed9ccf1355984a47b8c00ec22`，包含本轮前新增的跨 observer revision-specific in-flight/2s backoff guard；该版本之后已 fresh reload、重启和完整跑 happy 场景。没有把 storage IO 失败/ACK storm 说成浏览器已执行，其失败矩阵由主代理门禁负责。

`source-identities.json` 另存当时 runner/fixture/package/lock hash。额外 DOM/proof helper hash 明确标为 after-run 捕获，不伪称原运行开始时已记录。

原生 focus loss 在该 headless 环境不成立，结果 `not-run-environment`；真正 document-hidden/background、成功 SVG graph/image 的正向 ack、windowing/scroll-restore/child-branch、全部 SDK 分类/extension 方法/迁移与存储安全矩阵、Safari/iOS/Windows 均不能由本轮证明。完整 `notAutomated` 见 report。旧失败轮只是调试证据，不作为本轮结果替代。

## 清理与证据

Next PID **1083728 → 1088529**，端口 **44329**；均正常退出 **0**，forced=false。最终 fixture `/var/tmp/notification-browser.xeCgRCyM`、成功 wrapper temp、所有 owned Chromium 已清理；无对应监听，仓库 dev lock 不存在。只剩既有 unrelated services Next PID 1005816，未触碰。六个已结束失败 wrapper 在确认正式证据存在且无 active owner 后清掉重复临时副本。

本目录保存两份 server log、report、source identities、network/commands、真实截图；trace 仅因本轮明确 E2E_RETRY=1 而保留，video off。未编辑产品/package/lock/AGENTS.md，未提交/推送。
