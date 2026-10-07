# 独立审查与修复交接

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

## 审查实际发现（不是新产品需求）

只读 reviewer `01a111d9-464e-7540-97bf-c48bf2f8a0c1` 发现三个P1、三个P2；浏览器首次实际运行另发现来源边界阻塞。

1. P1：scope parser会剥掉无效 `:free/:invalid` 后缀，把明确目标替换成基础模型。持久化/HTTP/父引用必须exact，合法profile模式不能忽略diagnostics。
2. P1：失败目标provider重注册仅记diagnostics，旧定义仍可通过selection。需按provider关联注册失败并在enqueue前拒绝。
3. P1：内置与表单虽默认true，缺字段markdown/API profile仍false。新缺省true，既有明确false/aliases保持，历史snapshot不迁移。
4. P2：只有exclude许可，SDK默认激活集合使explore缺grep/find/ls。只初始化coding集合，不能硬名单掉晚注册扩展或强行复活扩展off/defaultfalse。
5. P2：Win32 shell映射后的powershell不在snapshot许可decoder，需统一集合并round-trip；这不等于实跑Windows。
6. P2：cold set_model标准持久化失败时，已发布constructor目标wrapper残留。需受锁ready/标准setModel/publish及identity-safe失败清理，不误关并发winner。
7. Browser blocker：默认inherit的合法global absolute配置文件被C provenance授权错误限定在agentDir。inherit不要求C；top-level明确入口的baseDir仅解析基，不能当权限root；C仍必须当前enabled/trusted入口与canonical containment。

## 定向修复 owner

- A fresh GPT `01a111ee-9ce5-7540-97bf-c491bdf79967`：selection/registration-ledger/profile defaults/builtin init/shell集合/runtime。完成，112focused +18source/restore、tsc0、15lintfiles0error/warning。报告review-fixes-a.md。
- B fresh GPT `01a111ee-9ce9-7540-97bf-c492797e57b6`：RPC/agent route/provenance边界/cold发布事务/native pins。完成，210focused、tsc0、5lintfiles0error/warning。报告review-fixes-b.md。
- 接口：selection.requestedReference是exact高优先；initializeSubagentBuiltinTools在ready后初始化仅coding，cold保留nativepins（含[]），扩展保留当前activation。
- source refs仅explicit false保存；true历史refs不得成为mandatory C gate。

## 修复合流后实测

主代理在没有产品写代理时完全隔离HOME/XDG/祖先路径运行：

- tsc --noEmit --incremental false：exit0。
- ESLint JSON：722files，0errors，0warnings，exit0。
- npm test：2961tests，2961pass，0fail，exit0。
- 证据：after-review-tsc.log、after-review-eslint.json、after-review-lint.log、after-review-tests.log。

这仍不是browser通过。首次browser运行到新child之前provider-source-invalid，child请求/搜索0、Kimi0；1280px新profile默认和parent标签已实测，后续矩阵未到达。完整证据在browser-report.md与正式截图/trace目录。修复后需fresh browser重跑，不修改fixture路径绕过合法absolute入口，也不mock产品API/SSE。

## Fresh复审与第二次browser

readonly `01a11212-bd51-7540-97bf-c49b6768cba2`逐项复审七个反例，无残存P1/P2；另做public SDK纯内存exact/suffix/nested/virtual/diagnostics及legacy残留/native失败probe，0请求/写盘。其余执行依据既有after-review-tests，非本次重跑。

fresh browser `01a11212-bd54-7540-97bf-c49c06b0be9e`前两run实际完成new/warm/reload/cold search/coding声明及历史物理Kimi不授权，另一次390px默认表单通过，但完整bad Send/picker/legacyFalse矩阵未到达。最后fresh run在childfactory后间歇`auth-unavailable`，parent3calls、child/search/Kimi0，已停止，不算全绿。`browser-report.md`和16-43-48目录保存真实refusal；新的核心owner调查native auth availability/refresh时序，**race目前只是线索不是已证根因**。

受控真实SDK native/legacy Responses request、stream、message_end来源append与reload/off/endpoint/falsehost13/13、Kimi/外部0已另实跑，见native-search-hooks.md。未跑真实pi-sub2api与平台不是把此fixture省略算通过。

## 认证就绪与final-scope复审

真实SDK barrier已证明availability supersede机制，child-only公开refresh/getAvailable队列修复；main focused69/69、整树2984/2984、tsc0/lint728files0，after-auth-*。历史browser确切interleaving仍未instrument，不能反推已证。

只读queue reviewer `01a1122f-b97e-7540-97bf-c4acfdd1254b`另复现P2：finalquery期间更新same-ID native catalog，目标仍available但名称不再匹配enabledModels，selection返回旧scope/旧baseUrl。纯内存probe returnedScope fixture-gpt/currentScope fixture-other、old/new.invalid endpoints、请求/TCP0，无SDK内部selfwait/P0/P1证明。

main仅selection追加公共catalog/配置输入的内存一致性fence，变化typed拒绝，不输出signature或变来源代际；新增真实SDK finalquery same-ID/alias/pin/endpoint countertest。第一个fixture错误把公开同步getAllModels写async，保留失败catalog-scope-fence-tests.log；改回真实签名后11/11及2filelint0，catalog-scope-fence-tests-final.log。整树最终复跑待SSE启动拒绝提示补齐。

第三browser17-11-31完成new/warm/reload/cold/390默认/backdrop，但pre-P2-fix snapshot不算最终版；bad realSend在SSE startup-error被拒绝，0promptPOST且draft留存，却缺目标/明确未发三语，runner等POST超时。HTTPclient用例没覆盖connect前失败。freshclient/SSE owner拟typed startup DTO与真实stream→connection→hook countertest，浏览器对应应审计prePOST拒绝而非强迫一定POST，不删除UI/历史/零请求断言。picker/false/globalsettings仍未到达；此次ownedPID/home已清。

## 运行安全与未完成

不得长时间get_subagent_result(wait:true)：曾15分钟无输出触发parent watchdog并中止worker；之后使用后台通知/短状态查询、可见阶段命令，不把自动中止当用户取消或范围变化。

任务仍in_progress、未commit/push/archive/deploy、未改真实settings/auth/model/search、pins/lock一致。只改独立feature worktree，原通知中心WIP未触碰。原checkout的8505/26812服务是其他任务，禁止停止。下一步：fresh browser全部matrix，定向只读复审上述反例，实际spec/docs与任务验收收尾，再最终合流验证和owned临时工作区/进程清理。
