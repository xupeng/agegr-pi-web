# 实施／验收进度

状态：2026-10-06 用户已明确批准最新最终摘要，开始独立工作区实施。主路径为独立child runtime加载合法扩展；C仅保留明确noExtensions例外。必须先通过SDK技术门禁，失败停止反馈，不擅自改变范围。

本任务是同一子代理初始化／恢复合同的跨层修复，不因文件数量拆成互相隐含依赖的任务。下列阶段有明确前置与独立验证产物；不得只交付“默认开关”而遗漏模型gate或动态工具许可。

## 0. 开工门禁

- [x] 复核PRD R1–R8/AC1–AC10映射、三份文档和manifests；呈现Goal/Scope/Acceptance/Decisions/Risks，用户后续选择approve_implementation，可task.py start。
- [x] 确认默认继承仅改变新建，旧false/旧确切tools不扩大，skills/Chat-only/APPEND_SYSTEM不自动继承；provider-only例外及“不自动配置搜索”在批准摘要明示。
- [x] dirty checkout属于通知中心，未切分支/stash/暂存/复制其改动；独立feature worktree基线e0ad630，路径见research/baseline.md。
- [x] 重读共享owner合同，保留既有admission/通知边界；SDK pins与lock未改。
- [x] 实测TMPDIR/独立HOME与祖先资源，复用npm-ci依赖树；无大型缓存副本。

## 1. 公共SDK技术门禁（后续阶段全部依赖）

- [x] 真实SDK no-install adapter验证bootstrap/final/reload、缺包/版本不符/disabled/trust撤销；不二次安装，见sdk-gates.md/source suites。
- [x] resolved filters/sourceInfo/path metadata/alias/cwd真实对比；具体文件不展开目录/glob/spec。
- [x] 公共services完成legacy/native/virtual及认证；独立runtime，不刷新/改父，未用SDK私有字段。
- [x] 同Extension live Map初始/晚注册过滤，nested/deferred/codemode与歧义deny反例已测。
- [x] 延迟web_search、hidden/defaultActive:false/主动关闭与reload carry已测，不强制activate扩展。
- [x] wrapper ready/binding beforeprompt与真实native执行/迟搜索已测；不是timeout猜测。
- [x] provider-only必要factory，无隐藏session/工具/lifecycle/eventbus/MCP转移；不走自动安装或私有API。
- [x] 受控真实SDK native/legacy Responses payload/stream/message_end/迟register/reload/off/endpoint/falsehost13/13实跑，见native-search-hooks.md；非manualemit或plainfaux请求。
- [ ] 真实pi-sub2api配置/搜索服务与Safari/Windows实跑未覆盖；受控hook fixture不冒充这些平台/插件证据。

阶段产物：research/中的真实SDK门禁报告，列实际依赖ref、断言、命令和未覆盖；静态阅读不算通过。

## 2. 默认策略、资源decoder与工具政策（依赖阶段1）

- [x] 修改内置profiles/新建UI/缺省字段为继承；boolean/none/false/all/true解析一致，规范字段优先，未知值不扩大权限；route严格验证，显式false与foreign字段不改写。
- [x] resourceSnapshot v1增加独立versioned toolPolicy/providerSources；旧无policy确切名单、旧false不升级；来源采集/重放已实测。
- [x] 区分“非child”与“child快照损坏/未知版本”，后者拒绝执行但可浏览；不能null解码后走普通全资源路径。
- [x] 新policy路径使用excludeTools限制内置/reserved，registration-aware扩展projection复用selector owner；deny在ext:*路径同样生效，保留曝光和激活语义。歧义deny fail-closed。
- [x] branch/reload/current trust/Chat-only/skills/精确prompt与reserved控制回归已测；cold保留native coding pins含[]，powershell映射codec一致（Linux模拟win32）。

阶段产物：profile/decoder/tool policy真实运行与round-trip测试；不用配置脚本修改真实用户profile。

## 3. 显式选择与统一初始化（依赖阶段1/2）

- [x] selection owner复用getLatestModelChange与SDKscope解析，区别显式选择/physical response；strict执行投影不改UIfallback。
- [x] 新建request/profile/parent优先级，cold恢复活动branch model_change，所有路径在child runtime重新解析；constructor始终显式model。
- [x] 默认继承新建/Agent resume/浏览器重开共用独立services，无父wrapper也恢复合法provider，不要求provenance。
- [x] 明确false C采集/最终来源确认/代际，旧false alive合法父补全或拒绝；默认inherit不要求hint。
- [x] 当前无安装/trust/enablement/版本/canonical授权，global absolute合法入口与package根区别已修；必要具体文件不展开search，legacy贡献证明/动态/虚拟边界实测。
- [x] auth/model/scope/source/policy错误及SDKfallback/mismatch转typed refusal；alive错误wrapper在resume/prompt拒绝，branch/reload后不跳过gate。
- [x] admission前失败不增加queued/running/result，不失效ask/草稿、不发completion；await ready，失败dispose未发布状态、locks清理可重试。（prompt admission gate已接；start locks清理沿用既有）

## 4. 显式改选与客户端错误（依赖阶段3）

- [x] cold user-command intent exact目标优先、ready/SDK标准persist beforepublish；auth失败无registry orphan，锁内竞争winner安全，见review-B真实SDK/HTTP。
- [x] alive set_model用同gate，失败不写model_change；resume+model schema/执行明确拒绝。
- [x] api-types定义安全selection/resource/tool-policy DTO，agent-client窄decode。prompt保留prompt_rejected/accepted:false，不能换成其他admission code。
- [x] client解码→formatter→hook真实callback三语/draft/旧ask/negative ack守卫验证；raw/auth/URL不回显，不自动发送重试。
- [x] 不删Kimi响应/cost/compaction、不改父文件/default，不引入通知中心行为变化。

## 5. 自动化矩阵（依赖阶段2–4）

| 类别 | 核心断言 |
| --- | --- |
| 默认/配置 | builtin/form/缺字段继承；显式false/none、规范字段优先、alias与foreign keys保存 |
| 模型 | 新建优先级、scope/auth/pins/nested/ambiguous；目标非法零请求 |
| warm/cold | 完成后shutdown/resume；新进程无父wrapper恢复GPT；Kimi请求0、same id/branch |
| 搜索 | factory/延迟session_start/turn_start/re-register/reload；本地direct search和native request hook；ready前零prompt，不强制配置/激活 |
| 工具policy | ext:*与限定allow/deny、同名/歧义alias、reserved、hidden/defaultActive、主动关闭、nested执行旁路 |
| 无安装/授权 | bootstrap/final/reload缺包/版本不符0安装、disabled/trust撤销0未授权factory、filters/sourceInfo/worktree cwd |
| provider-only | falsechild必要index文件；search/其他入口0、无lifecycle/hooks/tool/MCP泄漏、父runtime不变 |
| 来源 | native覆盖/失败、legacy合并多来源拒绝、sourceInfo补全、reload代际、动态失效、branch记录、伪造路径拒绝 |
| 快照 | 新policy与旧v1名单；旧false不变；malformed/未知child不走普通启动 |
| 异常历史 | GPT change后Kimi响应仍GPT；alive错误拒绝；旧false可信父补全或明确拒绝 |
| 恢复操作 | 原模型不可用也可cold set_model；标准entry成功/失败不写；并发intent不丢；resume+model报错 |
| 清理/admission | single-flight/closing/取消/失败再开；result/ask/草稿/通知保持；dispose不影响父 |
| 回归 | normal/Chat-only/exact prompt/skills/APPEND_SYSTEM/tools/branch/fork/virtual/model UI/default保存 |
| 浏览器 | 新表单默认、child模型标签、恢复失败提示/草稿、合法改选再发送，移动视口 |

单元放lib/app/components/hooks/public的npm test glob内；真实SDK集成建议lib/subagent-model-restore.integration.test.mjs及工具policy/search契约测试。e2e/subagent-model-selection.mjs用隔离agentDir、本地faux-provider/search backend，真实外部模型/搜索请求计数0。不能以源码regex/数据链路脚本冒充运行或浏览器验证。

## 6. 运行命令与产物

仅在获批独立工作区运行；安装及自动化门禁已执行，browser按隔离wrapper运行：

```sh
npm ci --include=dev
node_modules/.bin/tsc --noEmit
npm run lint
npm test
node --experimental-strip-types --test lib/subagent-model-restore.integration.test.mjs
node e2e/subagent-model-selection.mjs
```

- 使用~/.pi/agent/bin/pi-tmp-run --keep-on-failure提供唯一TMPDIR；隔离HOME/PI_CODING_AGENT_DIR/project/sessionDir。不把git worktree/唯一源码放自动清理缓存。
- Playwright results=$PI_TASK_TMPDIR/results，无默认video，trace仅失败；正式日志截图转存本任务research，不只留缓存唯一副本。
- 不在开发checkout next build；独立e2e服务记录PID/日志/目录并finally只停止自己进程。不写真实MCP配置、不连生产agentDir/dev服务做有副作用测试。
- 记录lock安装来源/ref/各命令exit和实际test计数、覆盖/未覆盖；Safari/Windows未实跑明确披露，不把Chromium冒充Safari。
- 清理本任务临时产物/进程，worktree检查dirty后git worktree remove；长期保留项报告用途和清理时机。

## 7. 回滚／交付

- 产品工作独立提交，只暂存本任务owner/hunks，不git add .或-A。
- 回滚默认/decoder/tool policy/services/gate按完整合同一起处理，不能只撤fail-closed留下unsafe恢复。真实用户settings/history未改，不需要数据迁移回滚。
- 不自动重启/发布生产；部署或真实会话验证另需授权，不发付费测试请求。
- 验收后才更新实际docs/specs；work → specs → task artifacts → archive → journal → PR均落任务特性分支，显式git push origin <branch>。未通过门禁不归档/宣称完成。

## 当前验收状态

已从自动中止恢复并完成定向修复；最新合流树tsc0、ESLint722files/0errors/0warnings、npm test2961/2961，证据after-review-*。独立审查曾发现六项反例及browser global-absolute来源拒绝，修复A/B均有真实countercase，见review-findings.md/review-fixes-a.md/review-fixes-b.md。

首次browser绝对来源拒绝已修；fresh只读复审七项修复无P1/P2。第二browser前两run实际完成new/warm/reload/cold/search/coding，390表单默认另一run通过，完整后矩阵仍未到达。最新fresh run childfactory后间歇auth-unavailable；已停止browser，不用retry掩盖。核心owner正在定位，race仅线索未证明；bad Send/真实picker/旧false/globalsettings完整验收仍pending。

核心已真实SDK barrier证明availability失序机制并仅child自有runtime公开refresh/getAvailable串行化；历史browser那次具体sequence未追踪，不能倒推已证明。main原生修正测试sourceproof断言后fresh隔离focused69/69、tsc0、ESLint728files0error/warning、npmtest2984/2984；after-auth-*为最新证据。Native hooks13/13仍通过。

只读queue review另复现finalquery same-ID改catalog后旧scope/pin/endpoint仍返回P2；main增加内存catalog/scope一致性fence及真实barrier反例，11/11focused/2filelint0。最终整树待后续合流。

第三browser实际new/warm/reload/cold/390 defaults/backdrop通过但pre-P2snapshot不是最终版；bad realSend在SSE startup_error拒绝、0promptPOST/draft留存，缺目标/未发三语，picker/false/globalsettings未到达。已原生apply SSE专用prePromptRejected+safeDTO仅connected前marker，client严格投影/onlyprePOST消费，HTTPprompt_rejected/acceptedfalse不变；真实stream→connection→hook82/82，latest整树after-sse tsc0/lint728files0/npmtest2996/2996。runner审计真实startup SSE/0POST并保留全部草稿/history/UI/零provider请求断言。

最后只读check发现live模型与已解析同ID的model公共数据不同仍继续P2；main在RPC/newchildpostbind对照resolved.model，endpoint/API/headers等漂移typed拒绝，新增真实SDK+真实wrapper12/12反例。reload受控faux固定explicitAPI避免随机adapter身份，不弱化guard。最终整树final-* tsc0/lint728files0/npm2997/2997；最新readonlyfocused guard复审入口已封、8memoryprobes/0requests/TCP、无新P级。

最终main在liveguard之后fresh运行已有browser一次exit0，18-04-41目录15groupedchecks通过、model15/search5/Kimi/external/pageerrors0；Nextdevmetadata2独立列计。7截图/日志正式保存，所有ownedNext/browser/backend/home已清。AC1–10已勾，acceptance.md证据映射；task仍in_progress仅等待未授权提交/PR/归档，未commit/push/archive/deploy。真实pi-sub2api/搜索服务/Safari/Windows仍如实未测，不把受控hook或结构assert冒充。
