# 验收矩阵

本文件定义验收要求，不是整张矩阵通过声明。2026-10-06 已执行干净依赖门禁、真实 SDK 生命周期与双独立 Chromium 核心场景；实际通过/环境跳过/未覆盖边界、环境与源码身份见 `research/verification.md`。源码断言、单测、SDK 集成和浏览器证据分别记录，不相互冒充。

| 场景 | 预期 | 证据类别 | AC |
| --- | --- | --- | --- |
| 不选项目，另两个项目分别完成和等待输入 | 全局入口可开，正确项目/会话摘要，等待置前 | SDK集成+真实Chromium | 1、10 |
| 项目从未在当前浏览器加载过 | 仍收到事项，无全量逐会话下载/AgentSession重建 | route/SDK集成+网络断言 | 1、10 |
| 不授予Notification权限 | 中心正常，浏览器通知设置仍独立 | 真实Chromium | 1、13 |
| 两标签页、两独立context | 一端ack后本端即时、另一端≤3秒，项目/中心同步 | 真实Chromium+时间记录 | 2、3 |
| 关闭浏览器，服务端完成，重开 | 未查看项出现 | SDK集成+真实Chromium | 4 |
| 已提交完成记录后正常重启服务 | 同revision/未查看状态恢复，无重复系统提醒 | 隔离服务重启+真实Chromium | 4 |
| ask在wrapper回收/重启后 | 沿原镜像恢复，存活wrapper否定态优先 | ask集成+真实Chromium | 4、7 |
| 普通扩展请求服务重启 | 旧请求不继续可操作，新请求新identity | SDK集成 | 7、11 |
| 只开中心、读摘要、选中但未见结果 | 完成项不清 | 真实Chromium | 6 |
| 失焦/后台/中心或设置遮挡/全屏文件 | 不自动ack；恢复前台可视后才ack | 真实Chromium | 6 |
| 同entry过程块可见、答案不可见 | 不ack过程副本；实际答案进入视区才ack | 真实Chromium | 6 |
| 分页未载、窗口化卸载、恢复滚动时隐藏 | 不ack；挂载并可视后才ack | 真实Chromium | 6 |
| 长答案部分正文进入视区 | 可ack，不要求整段全可见 | 真实Chromium | 6 |
| 兄弟分支无结果/后续分支包含结果 | 前者不ack，后者按entry包含关系可ack | context测试+真实Chromium | 5、6 |
| 正在运行且目标在另一分支 | 不暗中navigate_tree，保留待查看并提示 | 真实Chromium+命令断言 | 5、6 |
| 点击另一项目通知，工作区记忆指向旧session | UI和URL均保持显式目标，reload一致 | session-restore回归+真实Chromium | 5 |
| 新run开始后旧未查看完成项 | 仍可见；running指标不遮掉标记 | tracker/UI单测+真实Chromium | 8 |
| 正常新完成、R1 ack迟到、批量期间R2完成 | 合并最新，R1操作不清R2 | store单测+两端浏览器 | 8 |
| 同会话旧完成+当前pending；批量全部标已查看 | 只清completion，等待不关闭，项目按会话去重 | store/UI单测+真实Chromium | 2、7、8 |
| ask/confirm/input/editor/custom打开并仅查看 | 等待始终保留；仅实际结束/取代后移除 | SDK/ask集成+真实Chromium | 7 |
| custom重复render、ask supersede/旧close迟到 | 不重复提醒，不清新请求 | runtime单测/集成 | 7、11 |
| 正常run，多个turn/agent_end，retry/auto-compaction/queued | 最终一次completion，绑定最终结果entry | 真SDK离线provider集成 | 9 |
| 中间error后重试成功、最终error、length/aborted | 恢复成功可完成；终态异常不冒充正常成功 | 真SDK集成 | 9 |
| Stop/watchdog/ask暂停/handled无run/独立bash/compact | 不新造completion，不影响旧完成 | tracker+真SDK集成 | 8、9 |
| handled命令触发实际run、延迟/settled deferred注入 | 实际正常run各自identity与entry，通知不依赖SSE在线 | 真SDK集成 | 9 |
| 特殊收尾错误归属不明 | 记录实际结果和限制，不伪称精确失败分类 | 专门SDKfixture，已知限制 | 9边界 |
| 子代理/仅Trellis snapshot | 不误入事项/计数/声音 | 单测+现有subagent回归 | 10 |
| 旧wrapper销毁后迟到run，删除/部分删除失败 | 无幽灵重建，按实际删除集合清理 | runtime/route单测 | 11 |
| SSE半开/断网，恢复online/visibility，新epoch旧响应迟到 | 兜底同步，保留旧列表+提示，权威新快照不被回退 | client单测+真实Chromium | 3、11 |
| 旧local key含无效id/子代理，多设备重复导入 | 校验/过滤，live优先，无已读复活 | migration单测+真实Chromium | 12 |
| 原子写失败/损坏文件/重试与新操作交错 | 不假ack成功，不覆盖唯一旧数据，降级可见 | persist单测+route集成 | 12 |
| 外站请求/坏JSON/超限批量/pending当ack | 拒绝，不改状态 | route单测 | 12 |
| 390px/桌面、safe-area、键盘、Escape和焦点返回 | 手机全屏可滚、44px关闭；Escape关闭不误Stop | 真实Chromium，iOS真机另报 | 13 |
| 三语key/主题，Chat-only/工具pins/ask/尾部跟随/恢复 | 无新增暴露或回归 | 既有单测+浏览器回归 | 13 |

## 证据约束

- tsc/lint/npm test依赖干净 `npm ci --include=dev`，记录锁一致baseline，不拿现有混合node_modules数字冒充。
- 源码断言/数据链路、SDK真实生命周期、真实浏览器三类分别报告。
- 浏览器主证据使用两个独立context模拟不同设备，不能只用共享localStorage的两页。
- SDK fixture不调用真实收费provider、不读取真实agent目录；HOME和PI_CODING_AGENT_DIR隔离。
- 正常重启与浏览器关闭场景必须实际执行，不凭代码推断；SDK特殊异常、崩溃未落盘、普通extension重启能力限制按PRD披露。
- Safari16.2/iOS真机/Windows未运行即明确未覆盖，不由Chromium通过推断兼容。
