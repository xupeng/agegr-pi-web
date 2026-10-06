# 当前冻结 source 的最后一次执行：未完成全矩阵

运行 2026-10-06 11:38:24.786–11:38:55.058 UTC；E2E_RETRY=0，trace acquisition/retention 和 video 均关闭。结果 **4 pass / 1 fail / 10 not-run**，harness 退出 1。按授权失败后即停止，未启动第二轮。旧 14 pass 只适用于旧 AppShell source，不能宣称当前 source 完整通过。

## 实际结果与停止点

通过 global-aggregation、revision-bulk-fallback、new-run-preserves-old、result-center-gate。禁全局 SSE 的独立 B：真实 POST response 后本端 **53.854ms**、另端 **337.576ms**，符合 3 秒边界。健康 SSE、文件全屏、focus、分页/process/code/Mermaid、metadata/mobile/restart 本轮尚未执行；不会将旧 source 的这些结果移用为新 source 认证。

result-settings-long 失败：`settings overlay must prevent ack`，completion revision `d8a0ff63-c443-41a2-bcd9-89f497d09b3c` 已不存在。

已有证据不支持直接归为“覆盖仍在但产品 ack”缺陷：report.observerEvidence 于 **11:38:52.177Z** 捕获真实该 revision ACK；唯一实际 final marker、markdown `NC LONG final answer`、bodyHeight=3278.906px、intersectionHeight=719.313px、focused=true、visibility=visible、**covered=false**。failure-result-settings-long-a.png 也显示真实长正文而无设置面板。

脚本 coveredLoad 在 reload 后只等待 bell/history interception，点击 Settings 后未确认实际 overlay 存在并持续到 history release；network 显示初始化 project adoption 和 force history read仍在发生。覆盖在验证前已消失，可能被该初始化 context adoption 退休。因而这是覆盖前提未稳定的 harness/setup 问题线索，而非已证实的产品遮挡门禁错误；没有进一步执行来假装确认根因。若另行授权修正，应等待实际 context adoption 并验证真实 overlay 的连续存在，不可禁用自动 ACK、伪造 focus/visibility 或弱化正文断言。

## Source identity

report.productHashesStart/End 覆盖 **33 个关键 product 文件**，包含新增 visible-content/types、useNotifications、globals.css、三语 messages、history/proof/final-answer 与 public routes；sourceChangedDuringRun=[]，结束后当前文件仍匹配。AppShell SHA-256：`111dde98d33f318067121d22821768cdf02610c9578056dc7c5d7dfaf41c46d0`；viewed-result：`f0c45348e7f7e191c69cc0233faf901a3bf4778ed9ccf1355984a47b8c00ec22`。runner/fixture/package/lock start/end hash 也一致。

仅 runner 增补 source identity 和 E2E_RETRY=0 的完全关闭 trace 模式；未编辑 product/spec/task status/主 verification，未重装依赖、next build、commit 或 push。仍使用安全 /var/tmp fixture、隔离 HOME/agentdir、SDK 1.0.0 offline faux provider、真实 public routes 与两个独立 Chromium context；ask 使用最小 protocol peer，不冒充完整真实 ask_user 源码。

## 精简与清理

本轮前清点 14 个自有已结束 browser-*，删除 **27 个重复 trace ZIP**，逻辑文件大小共 732,407,687 bytes；唯一保留 browser-2026-10-06T10-54-47-440Z/trace-server1-setup-extra.zip（350,696 bytes），用于 AppShell TDZ SSR/client 产品故障诊断。所有非 trace evidence（含 report/network/commands/serverlogs/screenshots 和唯一失败样本）保留。baseline/candidate、其他任务、活跃日志未动；完整删除清单与前后 allocated bytes 在 ../owned-trace-cleanup.json。正式 logs 由约 **712MiB** 降至本轮后约 **14MiB**。旧 verification 关于原 retry trace 的记载属于原运行状态；清理 manifest 记录其后删除。

自有 Next PID **1093061**、端口 **40411**，11:38:55.057Z 正常退出 **0**，forced=false。自有 Chromium/profile、fixture /var/tmp/notification-browser.GaSOx9Hb 已关闭/移除；dev lock 不存在、40411 无 listener。失败 wrapper 的重复临时副本在核对永久 evidence 与无 active owner后移除。既有 services PID 1005816 未触碰。
