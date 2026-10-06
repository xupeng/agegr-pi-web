# 实施清单

状态：用户已在最终规划摘要之后明确批准开始实现（2026-10-06）；task进入in_progress。执行边界与接口见 `research/implementation-boundary.md`，验证完成后逐项记录证据。

## 0. 进入实现前

- [x] 用户在最终规划摘要之后明确批准实现。
- [x] 确认当前task为本任务；特性分支feat/notification-center-sync，从personal@e0ad630创建，初始仅任务产物未跟踪。
- [x] 加载 `trellis-before-dev`，重新阅读真实规范与相关 docs/agents；JSONL 清单已去掉 seed，按具体分工补精确条目。
- [x] 确认 package-lock 与四个 Pi 1.0.0 pins不变；baseline与主仓candidate均建立干净 `npm ci --include=dev` 验证树，固定baseline与日志见research/validation-baseline.md。
- [x] 首次 shell确认 TMPDIR；大型依赖/源码 worktree 用主磁盘，非自动清理缓存。小验证产物用 pi-tmp-run，唯一证据留任务 research。

## 1. 运行分类先行（R8）

- [x] 实现纯 run tracker 与只读 boundary observer，先做单测。
- [x] 用当前 SDK + fake provider/extension 的隔离真实生命周期测试证明 run identity、turn entry、settled、retry/continuation/deferred 注入顺序。
- [x] 接入 rpc-manager loader 创建、公开 abort binding、Stop/watchdog/openAsk/可归属 rejection，核验 reload不重复注册、Chat-only不发现资源/加工具/改prompt、subagent抑制。
- [x] 对正常最终结果、最终error/aborted/length、ask暂停、handled无run、独立bash/compact分类；不按固定延时猜finalized。
- [x] 检查 wrapper replacement、closing、deleting与迟到回调。明确无法归属的特殊扩展收尾错误只记录已知限制，不改 SDK。

通过此阶段再做通知展示，避免把错误完成全局同步。若公开 API/锁一致测试与研究不符，暂停并更新设计；不得擅自升级 SDK 或降低需求。

## 2. 完成状态与持久化（R5、R7）

- [x] 增加 DTO/守卫、globalThis单例、opaque completion revision、instanceId/epoch/sequence。
- [x] 最新完成按 session聚合；新run不清旧项；不保存已读正文历史。
- [x] 复用0600原子写，ack成功以落盘为准，写失败dirty重试/health降级；损坏或未知版本文件不默默覆盖。
- [x] 单条/批量compare-and-clear、幂等与旧版本保护；新的R2不被R1动作清掉。
- [x] 接入实际删除集合/部分删除失败及watermark清理。

## 3. Pending聚合与元数据（R1、R3、R4）

- [x] 原owner提供窄pending快照/invalidation，包含ask和blocking扩展请求；custom重绘不增事项。
- [x] 存活wrapper覆盖磁盘否定状态；无wrapper时复用ask镜像，不为订阅重建AgentSession。
- [x] 请求处理/替换/超时/销毁同步移除；普通扩展重启不恢复旧Promise/组件。
- [x] 项目/会话元数据定向读取、有界并发与缓存；标题改变不改完成revision，不靠旧项目缓存判删除。
- [x] 单测验证未访问项目与subagent/Trellis过滤，以及有旧完成+当前等待的同会话情况；真实浏览器结果另记。

## 4. API与共享客户端（R2）

- [x] GET快照、POST ack/ack_many/import、实例级SSE；认证/host/origin、content-type、unknown输入、长度/数量限制齐全。
- [x] 订阅/快照竞态缓冲、burst合并、流关闭cleanup、handler故障隔离，不持会话lease。
- [x] 模块级useSyncExternalStore +稳定server snapshot、单owner连接、sequence/epoch/请求generation防旧响应。
- [x] SSE主路径+可见页面约2秒轻量兜底，online/visibility重取快照；错误保留旧列表并显示同步状态。
- [x] ack成功响应即时合并；失败不假成功，批量部分成功可重试冻结剩余集合。

## 5. 导航与真实已查看（R3、R6）

- [x] useAgentSession发布独立committed-history scope；不能挪用Trellis generation或optimistic消息id。
- [x] 结果entry绑定、分页定位、挂载目标、唯一结果marker；同entry过程副本不能触发ack。
- [x] IntersectionObserver+前台/焦点/未遮挡/ready/generation校验；正文Range/真实图像而非代码栏头或图形占位提供可视证据；长结果部分可见、空节点不算。
- [x] 不强迫滚动已上滚用户，不增加第二套tail-follow；不自动移动busy SDK leaf。定位失败保持待查看并提示。
- [ ] 真实浏览器已通过兄弟busy分支、分页、遮挡、R1/R2与迟到导航；原生失焦环境跳过，真实hidden/windowing/scroll-restore和旧observer回调矩阵未全部浏览器执行，不能标此完整行已完成。

## 6. 通知中心、侧栏与迁移（R1、R3、R7）

- [x] 顶栏全局铃铛、计数、桌面浮层/手机全屏、空态/加载/失败/降级态、等待置前/时间排序。
- [x] 摘要点击走显式会话采纳，保持URL>tab>workspace与项目导航；不因为点击直接ack。
- [x] 中心与会话/项目badge使用共享snapshot、会话计数去重；running仍由原poll负责，旧待查看不被running遮蔽。
- [x] 拆掉本地unread权威与运行差分标记，保留声音/浏览器通知原owner，不要求Notification权限；系统提醒去重未另行浏览器验证。
- [x] 批量标已查看只提交观察过版本，不处理等待输入。
- [x] 旧key实例作用域幂等迁移，服务端会话/抑制校验、watermark防复活、live优先；失败保留迁移输入（单测证据，不冒充浏览器迁移矩阵）。
- [ ] 三语键注册、样式与390px布局/Escape/focus-return/44px已验；真实iOS safe-area/软件键盘及全主题/字体矩阵未执行。

## 7. 验证门禁与证据

所有命令在与候选一致的干净 lock依赖树上执行；运行态测试隔离HOME/PI_CODING_AGENT_DIR，不对30141真实实例作写入。

```bash
npm ci --include=dev
node_modules/.bin/tsc --noEmit
npm run lint
npm test
# 新增单测/route测试置于app/components/hooks/lib/public五个npm test glob内
# 新增离线SDK + Chromium通知验收脚本后：
~/.pi/agent/bin/pi-tmp-run --keep-on-failure notification-center -- env E2E_NOTIFICATION_START=1 E2E_RETRY=0 PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium node e2e/notification-center.mjs
# 既有真实ask host链；需独立checkout无正在运行的.next/dev/lock：
~/.pi/agent/bin/pi-tmp-run --keep-on-failure notification-ask-host -- node e2e/ask-user-host.mjs
```

- [x] 新脚本用fake provider/extension fixture和两个独立浏览器context，独立localStorage；这是客户端隔离模拟，不冒称两台物理设备。
- [x] `research/verification.md` 按AC1–AC13分别记录证据与未覆盖；健康SSE远端68ms/fallback远端337ms，不用“最终一致”替代。
- [x] 正常重启验证复用同一隔离agent dir，服务停止后重启，不写live真实目录。
- [x] 既有完整npm test、真实SDK与通知browser提供回归证据；未单独执行既有ask-user-host/session-restore/browser宽矩阵，见报告。
- [x] 浏览器脚本和源码/数据链路测试分别报告；Safari16.2、iOS真机、Windows明确未覆盖。
- [x] 未执行next build；启动前确认30141无本仓健康实例/devlock，主仓独占新.next图及单个fake环境dev服务，不借第二端口绕共享锁。既有services实例未触碰。
- [x] Playwright结果指向PI_TASK_TMPDIR/results，录像关闭、最终trace关闭；正式证据转research，27个重复trace已精简，仅留一个TDZ诊断trace。
- [x] 精确停止自有Next/Chrome，清理fixture、无改动的固定baseline worktree与旧.next备份；其他任务worktree/服务保留。

## 8. 文档、评审与交付

- [x] 更新实际拥有者规范：通知状态/协议新spec与index、session-list-refresh的unread语义、sessions/runtime说明；记录可视ack和SDK异常边界，不把设想写成已实现事实。
- [x] 使用trellis-check检查清单并进行独立只读代码/跨层评审；发现三项有证据问题进入修正。未运行workflow。
- [x] 保留fork发布元数据、SDK pins和用户资产；工作/规范/任务产物均在同一未提交特性分支。
- [ ] 交付执行链：工作提交→spec→planning/acceptance artifacts→archive→journal→一个PR→merge→Git收尾。
      2026-10-06用户已明确授权全部动作；工作 `1c0fde4` 与spec `c914947` 已提交，后续动作
      以执行时记录为准。推送显式 `git push origin <branch>`；另一个任务不纳入本PR。

## 9. 平板/对话列锚定 UX 修正（2026-10-06 用户批准）

边界与证据见 `research/tablet-layout.md`；只补本次范围，不删历史、不把未跑项标通过。

- [x] 将本轮已批准需求/设计/实施与 AC14 补入 `prd.md`/`design.md`/`implement.md`，
      并记录精简 `research/tablet-layout.md`（行为差、真实 owner、必要文件、不做项）。
- [x] `NotificationCenter` 纯函数 `computeNotificationCenterBox` + AppShell 对话列 ref 接线
      + CSS 变量定位与 ≤640px `transform: none`；不改通知状态/网络/ack/导航/SDK/pending。
- [x] 新增纯函数矩阵与源码/CSS 契约测试。
- [x] 针对改动运行定向测试（39/39 pass）、`tsc --noEmit --incremental false` 与 lint
      （0 错误）。
- [x] 真实 Chromium 布局验收 `e2e/notification-center-layout.mjs`（667/800/1024/1280/390，
      侧栏开关/拖宽、≥960 分栏右面板、open 期间 resize；独立 persistent context，
      `/api/**` 全 stub）→ pass，报告与源身份见 `validation-logs/layout-2026-10-06T13-28-04-810Z/`
      与 `tablet-layout-source-manifest.json`。真实 iOS safe-area/硬件旋转与陈旧 dev CSS
      风险已在 `research/tablet-layout.md` 如实记录。

本轮未改 `.trellis/spec/frontend/notification-center.md` 与总验证报告（由主代理/检查代理
并发拥有），也未覆盖历史冻结的 `research/source-manifest.json`。

### AC14 独立 check 补充（2026-10-06，最终证据以本节为准）

- [x] 移除未经批准的280px floor，正宽可见anchor严格优先列/viewport padded交集；
      150px纯函数反例现在width126且栏内gap12，不再用“280可见”掩盖越列。
- [x] header与actions仅补必要折行/收缩CSS，close仍44×44；真实anchorRef、SSR、
      observer/resize cleanup、native dialog/focus、导航退休与移动transform保持不变。
- [x] 安全harness全部 `/api/**` stub、任何非GET拒绝、ServiceWorker block，两个ask
      假摘要与60项长列表，不点击事项/批量/刷新或写live；profile/results用PI_TASK_TMPDIR，
      短browserTmp0700并finally精确清理，不采集trace/录像。
- [x] 保留原对齐断言，新增左右同时展开、sidebar480/right300真实拖拽，open中
      1024→960→641→640→390→641→1024往返；独立641最大sidebar321得column320/
      dialog296。真实滚动、关闭hit-test与close点击/focus-return通过。
- [x] 最终browser10场景/39measurements/15screenshots通过，最大中心差0px；
      `validation-logs/layout-2026-10-06T13-41-40-298Z/` report与截图正式保留。
      HTTP CSS/实际computed-style正确，未restart/写.next强行刷新。
- [x] 最终完整tsc/lint/npm test与39定向测试：exit均0，lint733文件0诊断，
      npm3005/3005（13suites，0skip），与锁一致e0ad630 baseline逐项说明；
      `validation-logs/tablet-check-01a1116a-final/` 完整日志正式保留，隔离env-i与fixture
      祖先修正规则见 `research/tablet-layout.md` / `validation-baseline.md`。
- [x] 门禁及browser源码hash前后不变且相互一致，更新本轮tablet-layout manifest，
      不覆盖冻结证据；自有资源清理，8505两PID保留且HTTP200，正式1005816未触碰。
- [x] 主代理同步 `design.md §8` 删除被否决的min280公式，更新所拥有的通知spec/index、
      verification/task.json；保留历史冻结证据与本轮独立身份。真实<304px列/iOS键盘等
      未覆盖，不标其已验；8505用户服务有意保留，未提交/推送/归档。

## 风险文件与回退点

- `lib/rpc-manager.ts`：loader/生命周期/admission/Stop，不得先做UI再猜运行完成。
- `hooks/useAgentSession.ts`、`components/ChatWindow.tsx`：历史commit、分支/滚动/结果marker，保留原view owner和tail-follow。
- `components/AppShell.tsx`、`SessionSidebar.tsx`：入口/显式导航/计数/全局连接，避免全量加载和重复声音。
- 新通知persist/API：文件事务、epoch/revision、ACK/source validation；失败不能覆盖唯一旧数据。
- 原ask/extension pending：仅窄只读投影/invalidations，不重写交互模型。
- 回退保留通知文件/ask镜像与验收证据；不盲目删除用户数据，也不宣称能自动恢复旧浏览器标记。
