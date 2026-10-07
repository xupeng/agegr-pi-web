# 最终验收与交付边界

> 仓库内原始验收文件现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](evidence-retention.md)。

日期：2026-10-06。实现与批准的受控验收完成。以下为首次实现验收快照；用户后续授权commit/PR/merge/收尾，最新合流/交付状态见`research/pr-delivery.md`。
唯一feature worktree为`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`，分支`feat/subagent-model-selection`，基线e0ad630。

## 最终有效门禁

- `final-tsc.log`：tsc --noEmit --incremental false退出0。
- `final-eslint.json`/`final-lint.log`：728files、0errors、0warnings，退出0。
- `final-tests.log`：2997tests/2997pass/0fail/skip/cancel，退出0。
- `live-model-focused.log`：12/12真实SDK barrier、auth、scope、RPC stale-public-model拒绝。
- `sse-selection-focused.log`：82/82，真实server bytes→connection→hook三语及HTTP/unsafe/late/unacked/queued反例。
- `native-search-hooks-parent-tests.log`：13/13、16次owned Responses HTTP/SSE、request/stream/message_end/reload/off/falsehost、Kimi/真实请求0。
- 多workernative readiness重复：5fresh workers、100exactchild completions、Kimi/TCP0（native-auth-readiness-loops.log）。

以上均基于同棵clean lock-consistent npm-ci依赖树；SDK1.0.0与lock SHA18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f不变。运行隔离HOME/agentDir/XDG及祖先资源，owned临时HOME已清。

## AC证据映射

| AC | 证据 |
| --- | --- |
| 1 defaults/priorities/parent独立 | profile实际PUT/GET、review-fixes、SDK provider-run/runtime suites；browser1280/390表单 |
| 2 warm/idle/cold/search | model-restore真实RPC/HTTP/新进程；最终browser new/warm/reload/cold sameid/search |
| 3 false必要provider | provider-sources/run/native-hooks falsehost、旁search/lifecycle/工具0与SDK父独立 |
| 4 严格解析/失败注册/来源 | model-selection/review-fixes/provider-sources/native-auth barrier/filter/suffix/alias/pin suites |
| 5 admission/draft/ask/cleanup | realRPC失败starter/waiter、hook HTTP/SSE三语/附件/旧ask/result、不产生completion；browser真实0POST/historyeq |
| 6 current授权/快照/许可 | resource-loader/tool-policy/resource-snapshot/source suites，disabled/trust/版本/linkedroot/逃逸/UTF-8 envelope |
| 7 branch显式记录/旧来源 | model-restore活动branch/physicalKimi/旧false以及browser无父冷恢复与legacyFalse |
| 8 显式改选 | review-B真实cold intent/标准MCC/并发；最终browser mobile picker→persist→user retry→refresh |
| 9 regression/UI | 全套2997、真实native hooks、tool policy/live-data guard；最终browser15groupedchecks |
| 10 锁/隔离/清理/披露 | baseline与final日志、最终browser services/summary/PID检查、下述未覆盖 |

## 最终Chromium（在live-data guard之后）

main运行已有未改runner一次exit0：`research/subagent-model-selection-browser-2026-10-06T18-04-41-459Z/`，`final-browser-parent.log`。
summary.passed=true，全部15groupedchecks通过。真实Next/Turbopack/API/SSE/SDK+controlled loopback backend；没有产品API mock/React注入/假凭据或请求重试。

实际model15（GPT13/replacement2）、search5；Kimi0、externalTCP0、blockedbrowser0、pageexceptions0。精确Next devmetadata抑制2独立计数，不是模型/搜索请求。坏目标GET/events startup负ack且0promptPOST，English UI含目标/未发、草稿与完整history equality。真实picker standardMCC在live文件中运行断言后用户重试成功；文件随fixture清理，不能谎称api.json含picker response/完整persisted JSONL副本。

7张正式截图/API/backend/fixture/Next日志已保存。main查看unavailable-draft-390及explicit-recovery-390：旧Kimi历史保留、未发toast与草稿保留、replacement成功搜索/标签。失败截图上的Next开发issue指示来自预期startup拒绝console日志，不是pageexception；不是生产UI兼容证明。

## 独立审查

前七项反例修复复审无残存P1/P2；auth队列复审发现并修复finalquery旧scope P2；最终trellischeck又发现丢resolvedModel而live旧endpoint继续执行P2。main新增RPC/newchild公共model数据匹配与独立真实wrapper反例，稳定reload fixture显式API（非随机faux identity），不放松guard。最新readonly01a11263-1e80复核入口已封、无新可达P级，8memory probes pass/0请求/TCP。详见review-findings.md。

## 未覆盖与残余风险

- 未实跑真实pi-sub2api/第三方plugins、真实搜索服务/付费provider、Safari、Windows。
- Browser只English；三语靠真实stream/connection/hook可执行测试，不冒充三语browser。
- Windows powershell为Linux参数/注册模拟，不冒充真实Windows。
- Native request/stream hooks为受控真实SDK Responses fixture，不代表真实插件/backend。
- 受信任factory/hooks不是沙箱；许可过滤不阻止任意副作用。不自动改搜索设置/登录/激活hidden/off。
- 本机原通知中心WIP未改；还需后续任务分支PR交付/集成，不把独立基线当已合并生产。

## 清理与保留

最终Next精确owned PGID1273199/1273758均已停；browser/backend由runner finally关闭，唯一outer HOME /var/tmp/pi-subagent-final-browser.onPfqfiA已删除。此前browser/temp owned进程均清；未操作8505/26812/30141。
clean detached baseline通过git worktree remove移除；初次失败owned缓存23MiB及自有.orig已清。candidate源码/依赖与正式research约42MiB保留以供交付，不能在自动清理缓存保存唯一证据。
首次验收时task保留in_progress等待提交/PR/归档；AC全部已勾。用户随后授权交付：产品8e20421/spec3fdb1df/合流0ba3761，最新3150/3150、763lintfiles0、21-51-40 Chromium完整matrix通过。归档/日志必须与工作同branch/PR，不能合并后在personal/main补；真实插件/平台未覆盖保持。
