# 可复现测试方案（planning，不代表已执行）

> 最新范围：系统已安装版本为唯一工具源，Web/TUI host 并立，不加固定 dependency、不隐藏系统包、不保留 Web tool fallback。第 1 节保留原 ref `128fc3c7` 的复现；历史路径不是迁移后 imports。Web 协议/状态/UI 仍保留，最新 system-installed-host-decision.md 与 implement.md 为准。

> 最新追加决定：移除 Web 专用 UI/API/helper/env 开关，旧 false/env 0 不再阻止已激活的系统工具。下文第 1 节的 Web disabled bypass 属原基线；其余 disabled/reload 现在指 SDK 原资源/active tool 选择。按 system-discovery-no-web-switch.md 的退役回归验收。

## 0. 验证隔离约束

- 当前 TMPDIR 已核实为 `/home/xupeng/.cache/pi-tmp/01a10f4b-df5b-753b-a8de-d77cd104ece4`，不是 `/tmp`。
- 有限验证用 `/home/xupeng/.pi/agent/bin/pi-tmp-run --keep-on-failure ask-user-host -- <command>`；在子进程读取 `$PI_TASK_TMPDIR` 后创建 HOME、agent、cwd、package copy。SDK import / Web modules import **之前**设置 `HOME` 和 `PI_CODING_AGENT_DIR`，以免 persist.ts 的模块级 OPEN_ASKS_PATH 指到真实目录。
- 仅复制外部 `package.json` / index / bridge / tool / types / validation / format / tui-*.ts / LICENSE，不复制 node_modules / .git；独立目录不是 symlink。真实 discovery 通过 SDK 1.0.0 host alias 解析 peers，而非外部 devDependencies 0.85.1。
- SettingsManager.inMemory 或隔离磁盘 settings 都只配这一 copied package；不加载真实用户其他 packages、MCP、auth.json、models.json。PI_OFFLINE=1，JITI_FS_CACHE=false；ModelRuntime authPath 指隔离路径，refreshOnCreate:false。用 faux provider，不访问网络或真实模型。
- 只将摘要/断言输出保存到任务 research/；wrapper 成功自动清理临时目录，失败保留时报告后显式清理本任务目录。planning 阶段不启动 dev/production server，不运行 next build；浏览器验收留到实现获批准后。

## 1. 先复现当前失败（真实 package discovery，无模型请求）

参考 `lib/ask-user/portable/discovery.test.mjs:25-65`，使用 copied **外部新版 package** 与部署 SDK 1.0.0：

1. settings packages=[copy]，noSkills/noThemes/noContextFiles/noPromptTemplates=true。
2. extensionFactories=[createAskUserExtension(fakeRegistryLookup)]，PI_WEB_ASK_USER=1。fakeRegistryLookup 可返回 PendingAskStore-backed handle，但不实际 wrapper、不启动服务。
3. await loader.reload()；从 getExtensions 获取两个注册来源与 diagnostics；应出现 copied index.ts 在 inline 之前、同名冲突诊断。通过 ExtensionRunner.getAllRegisteredTools() 或真实 AgentSession.getAllTools() 获取唯一 effective source，断言 copied package 为 winner，effective exposure 缺省 direct。
4. 对 effective.definition.execute 调用 questions=[{id:"q",question:"Which scope?",options:[]}]，context 使用 sessionManager.getSessionId()="fixture-session"、mode="rpc"、hasUI=true；ui.custom 设置为 throw/spying，证明不会调 TUI。
5. 断言 exactly-one bridge got 0；fakeRegistry open 调用计数=0；无 pending ask、无 terminate 成功结果。
6. disabled：新 loader / binding PI_WEB_ASK_USER=0；inline tools 空，但 package ask_user 仍注册/effective，再现 gate bypass。

这比现有 extension.test（只手工调用 inline factory）与 discovery.test（只加载 portable package）更贴近真实故障。现有测试均没有两来源同 loader、first-wins 的组合证据。

## 2. 桥解析与所有权（实现后）

| 场景 | 必须断言 |
| --- | --- |
| 同 loader 唯一 host，rpc / hasUI=true | 一次 open，同问题 ack，terminate:true，ui.custom 不调用 |
| 另一个 loader 绑定 host | got 0；不 open |
| host await 后 register | got 0；不 open |
| 两 host 同步 register | got 2；两个 open 均不调用 |
| 同步 register 非函数 / listener throws | fail closed，不误报 posted；不能由 SDK swallowing 伪装绑定成功 |
| 缺 wrapper / closing wrapper / 不匹配会话 | fail closed；不碰其他会话 store |
| 不支持 version / malformed request | 注册正确、open拒绝，不 ack、不 posted |
| 空问题 /重复 id /超限 | validator 先拒绝，host调用=0 |
| ack 缺失 /问题身份或顺序不同 /错误 superseded | error，不 terminate成功 |
| enabled 与 package + inline | 唯一 effective owner、model-only，无意外重复工具冲突诊断 |
| SDK 原配置关闭资源/工具 inactive 或 hidden | 不强制激活/回灌；保持原声明与调用边界 |
| 旧 Web askUser:false / PI_WEB_ASK_USER=0 | 已安装且 SDK active 的兼容工具仍可发问，旧开关无效，不写配置 |
| General 设置与旧设置 API | 无专用开关/提示/按钮/fetch，API/helper退役，其它设置正常 |
| 系统未安装外部包 | Web 正常启动、无 ask_user，无本地备用 tool；旧 pending 仍由 Web 呈现/处置 |
| 单系统安装 + Web host | 唯一工具仍是系统来源、唯一同步 bridge；无额外工具/安装/包遮蔽，CLI/TUI 配置不变 |
| 系统版本更新与 reload | 按 v1 contract 兼容/拒绝，不按固定 SHA；不假报 posted |
| 未识别的第二外部同名来源 | 明确拒绝/冲突诊断；不是沉默 first-wins 或本地 fallback |
| extension带其他 tool / command / flag | ask policy不删除无关注册项 |
| 主会话 normal / read-only / coding pin / configured | ask按已有扩展carry存在，coding工具边界不变 |
| Chat-only / child loadExtensions开或关 | 不出现主会话ask_user，不产生 bridge-backed pending ask |

**reload 生命周期**：同一 services/AgentSession 的 SDK 资源允许→reload、原配置排除→reload、恢复→reload 至少3次；允许时唯一工具/bridge，无 got2；排除时不回灌，再 shutdown→rebuild 同session保留旧 askId。另测工具 inactive/hidden 不复活。没有 Web 开关轮换。不要将 loader.reload 单独循环等同真实 session reload；runtime teardown 用真实生命周期验证。SDK extensions/loader.js:147-160,412-422 跟踪 listener unsubscribe，Web call site 为 rpc-manager.ts:1412-1438。

## 3. 模型边界与 Code mode only（offline faux provider）

沿 `lib/ask-user/codemode.integration.test.mjs:15-66` 建 fixture，但增加 external package settings discovery，与生产相同的 services overrides / owner policy：

- getAllTools effective ask exposure=model-only；Code mode only 请求声明中有 ask_user。
- faux response直接toolCall ask_user：pendingAsk存在，provider callCount=1，无自动第二请求；SSE恰好ask.opened一次；TUI未调。
- nested codemode 中 `ALL_TOOLS.includes("ask_user")` 为false；`tools.ask_user(...)` 和自定义测试工具 `ctx.executeTool("ask_user", ...)` 均拒绝且 store没有新ask。不能仅测试 UI toolbar，看 callable registry 才能覆盖吞 terminate风险。
- 重复来源 / reload 后上述断言不变。外部 0.85.1 dev baseline 的通过不能代替 host1.0.0验证。

## 4. 现有 Web 状态与 admission 回归

- wrapper.openAsk→supersede：先旧ask.closed，再新ask.opened，ack superseded.reason/ids正确；invalid questions保留旧ask。
- submit/cancel命令立即返回closed，sendCustomMessage fire-and-forget；customType保持 `pi-web.ask.answers`、triggerTurn:true、deliverAs:followUp；same sessionId，无新普通user消息。
- get_state /无wrapper持久化fallback /重启重水合：askId保持、状态不因source仲裁清掉。
- stale-close迟到不会清新ask（resolve-pending-ask测试）；controller锁定/错误重试保留。
- preflight rejection（含MCP prepare Stop）旧ask不变；started/queued/handled accepted才作废；completion不等于admission。
- navigate_tree保留active registered non-hidden session tool，inactive/hidden不复活；configured/coding pins不失真；Chat-only不会回灌。
- closing old wrapper迟到destroy不清replacement的rehydrated ask。

回归文件：`lib/rpc-manager-shutdown.test.mjs`、`lib/rpc-manager-tool-exposure.test.mjs`、`lib/rpc-manager.test.mjs`、`lib/ask-user/store.test.mjs` / `persist.test.mjs` / `resolve-pending-ask.test.mjs`、`components/AskUserAppHost.test.mjs`。

## 5. 持久化故障测试的范围选择

当前 `persist.ts:105-124` best-effort，`rpc-manager.ts:590-604` 在persist前publish。现状探针应明确观测写失败仍可内存posted，不能写成durable验证通过。

若用户选择维持既有语义：测试作为已知债务/边界证据，不将其当桥接回归失败，也不增加outbox。

若批准strict-open：隔离路径制造文件父目录不可写/rename失败，断言新ask不posted、不SSE、不替换旧ask、toolerror；成功路径persist在返回ack前完成。还要测supersede atomic写失败保留旧entry与old askId。这需要单独实现事务契约。

答案send失败现状是已关闭 + 日志；若不批准outbox，必须披露，不承诺exactly-once/自动重试。

## 6. 获批准后的完整门禁与浏览器

- clean lock-consistent `npm ci --include=dev`（独立允许的磁盘工作区，不能主开发树原地污染），同树 tsc --noEmit / npm run lint / npm test；记录ref、SDK版本、覆盖文件/用例数和退出码。
- 外部版本记为测试证据，不是产品 pin；无系统扩展时 Web 编译/模块加载仍成立，有扩展时使用隔离 agent 配置真实 discovery，路径不硬编码。UI 不导入 SDK/TUI/未知系统源码。源码检查不能冒充分发产物验证。
- 真实Chromium隔离浏览器场景：installed package经实际Web服务资源发现→faux ask→shared卡片→submit/cancel→same-session follow-up；切会话、刷新、wrapper重建恢复；disabled+reload；新ask key/remount；跨设备轮询清卡。
- planning阶段不执行服务或浏览器验收。源码断言、loader探针不能替代浏览器证明。部署升级/restart也需实现后单独批准，不改服务配置。

## 本轮执行状态

只完成源码/部署/白名单配置只读核查。没有运行上述探针、没有完整tsc/lint/test、没有浏览器。未创建临时验证目录或进程，无需停止/清理预先存在的部署服务。
