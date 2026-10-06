# SSE startup selection refusal

日期2026-10-06，唯一feature worktree，未部署/提交或写真实配置。

## 实际遗漏与协议

第三browser实际badSend先ensureEventsConnected，retired目标导致SSE startup_error而没有prompt POST。旧HTTP callback测试mock掉readiness，故未覆盖目标/三语未发提示。这是实际用户路径，不是让runner等待一定POST。

fresh owner01a1123e-f936只读拟patch，main原生apply。保留startup_error/connectionstatus/stopretry，server仅connected发布前附code=model_selection_failed、prePromptRejected=true和safeDTO；late错误仅safeDTO。client严格marker+code+未ready解码，用既有safe投影；hook只有prePOST catch消费，不借HTTPaccepted=false或改prompt_rejected合同。bare DTO/raw文字/late/accepted queued绝不伪造未发。

## 落盘后真实验证

隔离唯一/var/tmp outerHOME→pi-tmp-run→innerHOME/agentDir，unsetXDG及祖先资源，JITI_FS_CACHE=false；npm更新通知关闭。SSE/server/connection/hook/HTTPformatter六文件82/82；tsc0；ESLint728files0error/0warning；整树npmtest2996/2996，after-sse-*与sse-selection-focused.log。所有ownedtemp HOME trap清理，未启动服务。

测试是real stream bytes→in-memory EventSource transport→真实connection→actualhookcallback，三语目标/未发、0POST、draft/images/旧ask/result/branch保留、0completion、lease清理、unsafe/late/unacked/queued反例。它不是Chromium证明。首次apply_patch部分失败继续执行其他file actions，main按recovery只读失败文件及必要duplicate依赖、修复重复connection test；最终上述门禁才是有效合流结果。

runner保留实际Send，等待真实GET/events startup_error而非不存在的promptPOST；断言safeDTO marker、目标、未connected、0prompt POST、UI未发/目标、草稿与完整history equality、provider/Kimi0。正式browser finalfresh正在跑，picker/false/settings equality不提前算通过。

## 未覆盖

真实pi-sub2api/搜索服务、Safari/Windows仍未实跑；不借受控native hooks或callback将它们改为通过。task保持in_progress、无commit/push/archive/deploy。
