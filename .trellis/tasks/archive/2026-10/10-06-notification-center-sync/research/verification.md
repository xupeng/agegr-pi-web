# 通知中心实现验证报告

日期：2026-10-06。实现及核心验证已完成；**不是 AC1–AC13 全部硬件/浏览器矩阵通过声明**。
用户已确认并授权交付；工作 `1c0fde4`、规范 `c914947` 已提交，其余归档/日志/PR/合并
按 `delivery.md` 的执行边界进行。历史候选记录仍保留其当时未提交身份。

PR33已建立，首次远程lint/tsc/e2e通过而两份测试的本机temp变量前置assert失败；已完成
test-only修复 `780c693` 与独立3005/3005复核。新补充证据见 `pr-ci-followup.md` / `pr-ci-review.md`，
不覆盖或改写原始manifest；归档与journal跟随同一PR，不在base合并后补提交。

## 源码与依赖身份

- 分支 `feat/notification-center-sync`，跟踪 `personal`；HEAD/baseline `e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`。
- 没有为了测试创建候选提交。平板UX修正前的冻结文件hash、tracked diff hash见 `source-manifest.json`，当轮浏览器另有33个product文件运行前后hash；本轮布局修改后的7项源码/锁文件身份另见 `tablet-layout-source-manifest.json`，不以历史hash冒充当前源。
- Node v24.21.0 / npm 11.19.0。baseline 与主仓均执行干净 `npm ci --include=dev`，四个 Pi 包均 1.0.0。`package.json` SHA-256 `8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713`；lock `18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`，没有改动。
- 所有运行态验证隔离 HOME/PI_CODING_AGENT_DIR；SDK祖先发现敏感fixture放本磁盘 `/var/tmp`，确认没有祖先 .agents/.pi/AGENTS 资源。没有真实 provider、付费调用、live MCP 写入、SDK私有方法改写、node_modules编辑或 next build。

## 正式门禁

| 候选 | tsc | lint | npm test |
| --- | --- | --- | --- |
| 固定baseline、干净安装 | 0 | 0 | 2853 pass / 0 fail |
| 初始实现、同类干净隔离环境 | 0 | 0 | 2989 pass / 0 fail |
| 平板UX前冻结product（含auto-name退休、ack退避） | 0 | 0 | **3002 pass / 0 fail / 0 skip**，13 suites |
| 当前product（含对话列锚定与窄列边界修正） | 0 | 0；733文件0诊断 | **3005 pass / 0 fail / 0 skip**，13 suites |

最终命令：`tsc --noEmit --incremental false`、`npm run lint`、`npm test`，日志为 `validation-logs/candidate-01a11076/{environment,checks,tsc,lint,tests}-delivery.log`。最终 browser harness 初始化修正后，又单独跑其两文件 ESLint 和 `git diff --check`，退出0。

第一轮候选的23个失败没有藏掉：全局 PI_OFFLINE/PI_WEB_DISABLE_MCP 干扰原有测试，另有 cleanup VM 未提取真实退休callback；环境改回 baseline 等价 `env -i`，提取 harness 修正后全过。原始失败记录保留。baseline污染来源及纠正见 `validation-baseline.md`。

纯tracker20项、**当前锁定真实 SDK 生命周期23项**、服务端存储/API/删除/客户端/正文证明/可视helper及既有回归均纳入最终完整suite；这些与浏览器证据分别报告，不能把包含关系累加成更大的测试总数。

## 平板UX前的真实 SDK + Chromium

最终目录：`validation-logs/browser-2026-10-06T12-44-42-649Z/`。2026-10-06 12:44:42–12:46:12 UTC，**14 pass / 1 not-run-environment / 0 fail**。`report.json` 的33个 product hash前后一致，`sourceChangedDuringRun=[]`。

真实 Next公共路由、真实SDK 1.0.0 offline faux provider、两个独立 Chromium context，实际不同 localStorage；不是手造 notification snapshot、fake SSE 或焦点/visibility stub。通知权限由Chromium后端真实 denied。ask使用原仓最小protocol peer，不冒称完整真实ask_user插件。

| 同步路径：POST成功至DOM更新 | 本端 | 独立另端 |
| --- | ---: | ---: |
| 健康 SSE | 44.5ms | **67.9ms** |
| 禁全局 SSE 的轮询 fallback | 57.4ms | **336.6ms** |

实际通过：全局跨项目聚合/pending-first/摘要不ack；R1/R2单条与冻结批量竞态/pending不清；新run保留旧完成；中心/Settings/全屏真实文件覆盖不ack；长正文部分可视；真实分页；同entry过程与final定位；代码栏头独自可视不ack、正文首行才ack；Mermaid真实loading/error不ack；迟到metadata跨CtrlAltN/重开退休；busy兄弟分支不navigate_tree/显式URL胜旧workspace并reload保持；390px fullscreen/44px/Escape不Stop/focus返回；健康SSE；关闭浏览器期间完成、同agentdir正常重启、revision/instance/read状态恢复、epoch改变、ask镜像identity与普通extension消失、刷新后保留。

原生失焦在该 headless 环境无法成立，明确跳过，不用模拟 `document.hasFocus` 伪造。真正hidden/background、独立windowing/scroll-restore/child inclusion、成功SVG/image/math正向ack与全平台矩阵未由本轮证明。

## AC证据映射与缺口

| AC | 已有证据 | 仍不能声称的覆盖 |
| --- | --- | --- |
| 1 | browser global-aggregation，metadata/runtime/routes unit | 所有真实用户项目/物理设备 |
| 2–3 | 双独立context健康/fallback量测，client倒序/epoch/online unit | 真实断网/半开恢复和跨设备网络环境browser全矩阵 |
| 4 | browser offline completion/同目录正常重启/刷新，private persistence unit | 系统通知跨重启去重（权限denied） |
| 5 | browser explicitURL/stale workspace/late metadata/busy sibling；restore既有单测 | 未单独运行完整既有session-restore.mjs |
| 6 | marker/proof/helper unit，真实分页/过程/代码/占位/遮挡/部分正文 | 原生focus skip、true hidden、windowing/scroll-restore、成功graphic正向场景 |
| 7–8 | owner/runtime/store unit；browser ask+extension、冻结revision、新run、重启 | 所有extension方法/late close/镜像失败均做浏览器矩阵 |
| 9 | 23项真实SDK+tracker分类；Stop/watchdog/ask/RPC既有回归 | 所有SDK分类未再次用浏览器逐行执行；特殊扩展收尾限制未解除 |
| 10–11 | subagent/Trellis/metadata/delete/partial/late callbacks unit与源契约；browser未访问项目/交互保留 | 子代理/删除全部browser形态 |
| 12 | persist/store/API/client migration/安全/IO失败 unit | 真实browser storage IO failure/ACK storm和全迁移browser矩阵 |
| 13 | 完整既有单测、三语键、SDK Chat-only/pins；390px/Escape/focus return | Safari16.2/iOS真机/Windows、完整主题/字体/软键盘；未独立运行ask-user-host.mjs |

## 评审与harness纠正

详见 `implementation-review.md`：独立评审三项问题已修，随后捕获TDZ声明次序、auto-name出口遗漏以及存储失败ack重绑反馈风险，均有修正与回归。readonly review不冒充runtime验证。

最终harness也修正两个真实前提错误，不改product去迎合测试：

- URL初始采纳未完成时开Settings会被后来采纳合法关闭；ACK时covered=false、正文719px可视，不足以指控“被遮挡仍ack”。现在先只读检查真实tab session adoption，再开/验证实际Settings覆盖，最后放行历史。
- reload仅等DOMContentLoaded+SSR铃铛，可能点击尚未挂React handler的服务器HTML。现在等实际async文件树（client hydration证据）再点击，未修改或强制应用内部状态。
- 曾尝试等待无选择文档的tab-new memory，但该文档不必写这种memory；该harness尝试失败记录保留，错误等待已移除。最新完整运行通过，不用旧14pass替代。

## 接受的产品边界

1. 仅同一个pi-web实例；不提供跨实例合并/只读历史/失败分类/中心内回答/全对话。
2. 特殊deferred/post-run扩展异常缺精确公开run归属，不声称严格分类已解除；SDK固定1.0.0。
3. ask镜像best effort；ordinary extension的Promise/组件不跨服务重启恢复。
4. 在完成写入持久化之前，无恰好一次/崩溃不丢保证；存储异常显示degraded并重试，ack失败不假清。

## 用户平板反馈后的布局修正（AC14，2026-10-06）

用户在真实平板截图后批准：对话栏水平居中、工具栏下方、宽度限于该栏、手机仍全屏。
本轮仅修改 AppShell 的真实列 ref 接线、NotificationCenter 几何/观察与必要CSS折行，
未改服务端/通知状态/ack/导航/SDK/pins；实施、独立check及反例详见 `tablet-layout.md`。

- 去掉固定靠viewport右缘定位，也去掉实施中未经批准的280px floor。有效可见列的
  padded bounds与viewport取交集；150px纯函数反例现为126px面板、两侧12px。
  真实resizer稳态最窄列为320px，**没有浏览器复现<304px列**，不混淆两类证据。
- 当前锁一致依赖树完整门禁：tsc exit0、完整lint 733文件0诊断、npm test
  **3005/3005、13 suites、0 skip**，定向39/39；正式日志
  `validation-logs/tablet-check-01a1116a-final/`，SDK/runtime用隔离env-i与经祖先校验的fixture。
- 当前源真实Chromium布局：`validation-logs/layout-2026-10-06T13-41-40-298Z/`，
  **10场景、39测量、15截图通过**。667/800/1024/1280、左右同时展开/拖宽、641最窄
  compact列、open中跨640断点往返、60项滚动、44px关闭及focus-return均实测；桌面最大
  中心误差0px。667px列407px、面板383px，641px列320px、面板296px，均两侧12px。
- 布局浏览器使用独立profile，ServiceWorker block、全部API由本地假摘要fixture兜底，
  131次GET、非GET为0，无live API/agent/MCP/ack写入。**只证明前端布局**，不是再次执行
  上述真实SDK/公共通知API完整浏览器链；后者历史14-pass记录仍按当时源身份保留。
- 本轮7项源码/锁文件在门禁与browser前后hash一致，主代理也核对与当前checkout一致；
  HTTP CSS与computed-style确认新样式生效。spec/design/report补写仅是文档，不改变已验product。
- 真实iOS/Safari/Windows、非零safe-area/软件键盘/硬件旋转，以及<304px实际列控件可用性
  未运行；现有全部AC1–AC13缺口未因布局验证而自动勾选。

## 收尾

- 最终自有Next PID **1112164→1113407**、port **39637**，均exit0/forced=false；Chrome/context/profile关闭，fixture `/var/tmp/notification-browser.9HlIlNUS` 删除；无devlock/对应监听。
- 不碰已有 services Next PID1005816，其他旧任务worktree保留。
- 固定baseline worktree确认HEAD与clean status后经`git worktree remove`删除；旧2.2GiB.next备份删除，主仓clean-install依赖和标准ignored dev cache保留用于后续开发。
- 重试trace清点后删27个重复副本，只保留350,696-byte TDZ诊断trace；清单 `validation-logs/owned-trace-cleanup.json`。最终两轮不采集trace/录像，正式logs约19MiB。
- 必要日志/截图/JSON在任务research；缓存不是唯一证据库。失败wrapper的重复结果在正式证据存在后清理，不删除别人的目录/进程。
- 用户于2026-10-06明确授权归档、一个PR、自行合并与Git收尾；工作→spec→任务产物→archive→journal
  必须同特性分支进入该PR，不能合并后在personal补归档或日志。历史未授权状态以其发生时为准。
- 用户后来要求8505供使用，开发服务**有意继续运行**：`192.168.11.233:8505`，CLI1118376 /
  Next1118396，主仓唯一dev graph。布局实施/check未重启、未second Next、未build，正式1005816
  未触碰。运行记录/日志在 `~/.local/state/pi-web/agegr-dev-8505-20261006-01a11076.{json,log}`，
  专用TMPDIR为 `~/.cache/pi-web/agegr-dev-8505-20261006-01a11076/`；用户停用服务后再精确停止
  自有进程并清理该运行临时目录，不作为验收结束自动清掉。布局browser/check自有临时资源已清理。
