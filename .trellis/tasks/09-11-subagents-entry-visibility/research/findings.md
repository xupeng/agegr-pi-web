# Subagents 顶部入口可见性调查

## 结论与证据等级

- 原始调查完成；以下第 1–7 节保留该阶段证据。后续用户已批准「仅在 pi-web 适配 Trellis 只读执行记录」的方案方向，新增研究见第 8 节；最新范围与审批门见 `../prd.md`、`../design.md`、`../implement.md`。**未实施业务修复，最终规划待审批**。基线：仓库 `8e49a9d`，2026-09-11。
- **入口不是功能开关指示器，而是当前 family 已知子会话的入口。** 没有子会话、切换到无子会话的主会话、新建空白会话时不显示，属于当前设计。
- **已验证刷新缺口：** 子代理在两次 running 采样之间创建并结束，前端可能永远没有拉取其摘要。父会话结束仅刷新父行，不能发现孩子；服务端虽然更新 `sessionListVersion`，侧栏没有消费它。故“这次出现、下次不出现；手动刷新又出现”有确定的代码因果链和纯函数复现，但**尚不能认定就是用户那次现象的唯一根因**。
- **工具来源确有区别：** 内置 Agent 持久化 `pi-web:subagent` 元数据并进入 Web RPC registry；本项目 `trellis_subagent` 则启动外部 CLI，使用 `--no-session`。后者不会通过当前模型形成入口；不能用“执行过子代理工具”推导“必有 Subagents 入口”。其他扩展 Agent 必须逐一核实，不能凭同名工具推断兼容。
- **完成本身不会隐藏已加载、正常持久化的孩子。** `completed/failed/aborted/interrupted` 都被 family 收入。如果用户是同一个父会话上“已有入口，普通完成后消失”，还需排查瞬时未落盘、关系数据退化、目录覆盖/删除或实际部署差异，而不能归因于状态过滤。

证据标记：**S**＝当前源码直接证实；**T**＝本次无副作用测试验证；**L**＝本机脱敏只读样本；**H**＝有触发条件的推断、未浏览器复现。所有行号均指当前工作树，不指已安装发行包。

## 1. 从按钮反向追踪到数据源（S）

### 1.1 AppShell

| 位置 | 行为 |
|---|---|
| `components/AppShell.tsx:124-140` | `sessionCatalog` 初值 `[]`；`handleSessionsChange` 整体替换目录。先去掉同 id 目录项，再追加 `selectedSession`，所以 selected 摘要覆盖目录同 id 项；`getSessionFamily` 后以 `Boolean(subagents.length)` 决定入口。 |
| `components/AppShell.tsx:334-338` | family 无孩子时关闭 agents 顶部面板，不只是隐藏按钮。 |
| `components/AppShell.tsx:1526-1564` | 工具栏的 Subagents 按钮/计数位于同一条件分支；与启用开关、当前 active tools、running 数量无直接条件关系。 |
| `components/AppShell.tsx:2244-2253` | agents 面板使用同一 `activeSessionFamily.root/subagents`。 |
| `components/AppShell.tsx:1184-1207` | 将 `handleSessionsChange`、`refreshKey`、`sessionActivity` 传给 `SessionSidebar`。 |
| `components/AppShell.tsx:1993-2006` | 侧栏通过 CSS 开合，内容仍挂载；普通收起侧栏不是清缓存原因。 |
| `components/AppShell.tsx:834-847,912-930` | hydrate 和父运行结束都查询 `?sessionId=父ID`；不查询 descendants，不刷新 family 目录。 |
| `components/AppShell.tsx:862,964,990,1022` | 创建、重命名、fork、删除通过 `setRefreshKey` 触发结构刷新；内置 Agent 创建孩子不直接走这些 UI 回调。 |

`lib/session-family.ts:9-42,46-80`：只沿 `relation.kind === "subagent"` 的 `parentSessionId` 递归找根。普通 main/fork 自成 family；fork 不继承原主会话的孩子。祖先缺失或成环则不加入任何 family；不按状态、工具启用状态或 transient 筛选。选中孩子时，只要祖先已加载，也可取得整族。

### 1.2 侧栏目录不是全量会话目录

`components/SessionSidebar.tsx:458-466,617-692`：按项目缓存 `Map<projectKey, SessionInfo[]>`，`mergeLoadedSessions` 合并**已经加载过的项目**并按 id 去重。不是把 `/api/projects` 的全部 session IDs 自动转换为关系摘要。

- `loadProjects`（`:563-614`）获取项目摘要、完整 ID 集合、running fallback；**不调用 `onSessionsChange`**。
- `loadProjectSessions`（`:628-692`）成功时写入一个项目缓存，`:670` 回调全部已加载项目的合并结果。
- `refreshSessionRow`（`:698-729`）是另一个回调来源（`:719`）；只在既有数组里 `map` 替换匹配行，**不 append 缺失行，也不加载未访问项目，更不发现孩子**。
- `loadProjectSessions` 的 `force` 仅绕过前端 cache/stale/loading 判断。`:644` URL **不带 `force=1`**；正常结构刷新依靠先执行 `/api/projects?force=1` 使服务端重扫。规范中的“项目会话 force”应理解为这一串行组合，而非第二个请求独立强制服务端刷新。
- `refreshLists`（`:732-739`）只刷新当前侧栏 project key；其他已缓存项目标 stale，不立即下载。
- `refreshKey` effect（`:741-758`）串行 projects → 当前 project；首次仅 projects，再由 project selection effect（`:1235-1242`）按需加载。
- `loadProjects` 出错会 catch 而不 throw；后续 project 请求仍可能返回服务端旧缓存（H，错误路径风险）。

当前已有竞态防护（`:577-587,635-652,658-669,681-690`）：不清空旧缓存、同 key 请求序号、stale 标记、单行 override 合并。**不能把规范里已修复的“force 清空目录竞态”当作当前已存在根因。** 不同项目 key 的过期缓存仍可留在合并目录中，直到该 key 成功重拉。

### 1.3 切换与历史恢复

- `components/SessionSidebar.tsx:969-974` 同步 selected 会话 cwd；`:1014-1046` 从 URL 的 `initialSessionId` 做单会话读取，再设置 cwd 和选中项；`:1235-1242` 根据项目 key 拉整个项目。
- 恢复父会话的瞬间，目录仍空：选中父会话不包含孩子数组，故暂时无入口；项目摘要到达后才可能出现（S/T，正常加载阶段，不代表持久化丢失）。
- 同项目切换通常命中缓存，不会因为切了 session ID 就重新查完整目录。跨项目首次访问拉数据；已访问且非 stale 的项目直接使用缓存（`:628-633`）。
- 按钮对应 selected session，而侧栏可单独切项目；若侧栏当前项目与选中聊天不一致，手动刷新只重拉侧栏项目，未必补齐选中聊天的 family（S/H）。
- 全页刷新会清空 React 目录和跨项目加载历史。内置孩子与父同 cwd（`lib/subagent-runtime.ts:207`），一般一次项目加载即可恢复；外部跨项目父子链若缺失祖先，需要额外加载祖先项目（H；本机样本未见此类）。

## 2. running 轮询与失效通知断点

### 2.1 当前轮询条件（S）

`components/SessionSidebar.tsx:777-847`：可见页约每 2.5 秒采样 `/api/agent/running`（`:173` 常量 `RUNNING_SESSIONS_POLL_MS`）；请求结束后排下一次，所以不是严格的最大 2.5 秒发现时延。隐藏 tab 停止采样并 abort，回到可见立即 poll。

`:853-891` 的结构刷新仅在：

1. `completedInBackground` 非空：上次运行、本次消失，且 **id 不等于 selectedSessionId**；或
2. `newlyRunning` 中存在不在 `/api/projects` 全量已知 ID 集合里的 id。

抑制子代理完成通知只影响声音/未读：`:862-864` 的过滤没有用于 `:878` 的结构刷新条件。**采样到的后台孩子完成仍会触发 refresh。** 但 id 已知不等于其关系摘要已加载；已知 id 首次变成 running 不会触发结构刷新。

### 2.2 失效不是客户端刷新事件（S）

- `lib/subagent-runtime.ts:283-286,333-344`：子代理创建、结果持久化后调用 `dependencies.invalidateSessionList()`；`:1870-1884` 的 `lib/rpc-manager.ts` 把该 dependency 接到 `invalidateSessionListCache`。
- `lib/rpc-manager.ts:324-332`：每个 wrapper 的 `agent_end` 也使列表缓存失效，并向自身订阅者 emit 原 agent event。
- **`lib/session-reader.ts:479-486` 只有 generation++ 和清内存快照，不广播列表失效事件。**
- `app/api/agent/running/route.ts:9-17` 返回 `sessionListVersion`；`app/api/sessions/route.ts:24-27,51-56` 也返回它。
- 前端 `SessionSidebar.tsx:804-825` 只解析 running IDs 和 suppressed IDs，未比较版本。全仓前端搜索 `sessionListVersion` 仅找到 `:737` 注释，没有实现；也未找到独立的 session-list-invalidated 消费链。
- `app/api/agent/[id]/events/route.ts:15-29` 是指定会话的 SSE，不是全局列表订阅。`hooks/useAgentSession.ts:1154-1193` 在 agent end/settled 路径更新聊天与运行状态，最终回调 AppShell 的单行刷新；工具结束分支 `:1319` 没有驱动侧栏结构刷新。

因此不能说“服务端已经 invalidated，前端自然会发现孩子”。浏览器 `cache: no-store` 也不绕过应用自己的 30 秒服务端缓存，更不生成缺失的请求。

### 2.3 最小漏刷因果链（S/T；非浏览器现场复现）

1. 目录只有父 `P`，已知 ID 集合只有 `P`，poll snapshot 为 `{P}`。
2. 两次采样之间，内置子 `C` 创建、落盘、完成，服务端 generation 变化，但没有采样见过 `C`。
3. 下个 snapshot 仍是 `{P}`，无 newlyRunning、无 completedInBackground，**不 refresh**。
4. 父随后完成，snapshot `{P} → {}`，因 `P === selectedSessionId` 被排除，仍不 refresh。
5. `handleAgentEnd` 只读 `P`；单行替换无法插入 `C`，入口继续隐藏。
6. 服务端 TTL 到期也不会主动推送目录；切同一缓存项目也不会自愈。成功手动刷新正确项目、结构事件、后续可见后台完成，或全页重载后重新拉项目，才能补齐。

相同任务如果 `C` 跨越采样窗口且是未知 ID，就触发 refresh，入口出现。这给出了时间依赖“有时有、有时无”的充分条件。隐藏 tab 期间完整发生的生命周期同样可能漏掉（H，谓词逻辑相同）。

## 3. 服务端 family/relation 与工具来源

### 3.1 API、缓存和关系协议（S）

- `app/api/projects/route.ts:22-60`：仅从持久化 `listAllSessions` 生成项目摘要与 ID 集合，再附加 registry 的 running IDs；不附加逐项关系，也不合并纯 transient 项目会话。
- `app/api/sessions/route.ts:24-49`：project 分支全量扫描/缓存后按 project key 过滤；单 ID 分支优先 transient runtime，否则定向读取文件，找不到才 fallback runtime。
- `lib/session-reader.ts:143-152`：同 id 合并时磁盘摘要覆盖 runtime 摘要。这有助于 transient 收敛，但也意味着 runtime 识别出的关系不一定能修补磁盘读取遗漏。
- `lib/session-reader.ts:201-264,330-379,392`：内存 30 秒缓存、generation 单飞、mtime 磁盘缓存；force 等待旧 scan 后 invalidate，新 generation 防止旧扫描回填。TTL 是服务端读取缓存策略，不是前端刷新定时器。
- `lib/session-reader.ts:272-301`：仅当文件 header 有 `parentSessionPath`（源自 header `parentSession`）时读子代理元数据；有效则设 `relation.kind=subagent`，否则有 parent header 的项退化为 fork。
- `lib/subagents.ts:13-15,344-351,394-422`：识别 `customType: "pi-web:subagent"`，数据要求 `version === 1`、字符串 `parentSessionId` 和 `parentSessionPath`。结果 `pi-web:subagent-result` 决定 completed/failed/aborted；无结果默认 interrupted；这不是隐藏条件。
- `lib/session-reader.ts:29-31,105-118`：目录识别只读文件开头 **最多两行/256 KiB**，跳过 header 后找 metadata；识别成功才额外读取尾部 256 KiB 的结果。标准内置 metadata 在第二行，符合此约定。外部实现即使写了相同 metadata，若不是第二行、超出边界或缺 parent header，仍可能列表不识别。
- `lib/rpc-manager.ts:2023-2076` 从内存完整 entries 读 metadata，且为运行的孩子覆盖 running status；`app/api/sessions/[id]/route.ts:62-93` 详情也读完整 entries。故非标准文件可能出现“详情识别、列表却是 fork/main”的差异（H；本机样本未发现）。尾部结果未读到通常仅改变 status，不会使入口隐藏。

### 3.2 来源对照

| 来源 | 创建与登记 | 当前入口结果 | 证据 |
|---|---|---|---|
| Pi Web 内置 Agent（前台/后台） | `lib/subagent-runtime.ts:176-178,207-241`：同 parent cwd，SessionManager.create 带 parentSession，先 append metadata，再创建/登记 wrapper；`:283-344` 开始/完成 invalidate | 孩子摘要加载到目录且祖先齐全即显示；前后台无可见性差别，只有采样/持久化时序差别 | S/T/L |
| 内置 profile 开启 loadExtensions | `lib/subagent-runtime.ts:199-238`、`lib/subagents.ts:384-392`：孩子仍用相同 pi-web 元数据，只是工具集不同，并排除子代理控制工具 | 不应因“孩子加载扩展”就失去入口 | S |
| 本项目 `trellis_subagent` | `.pi/extensions/trellis/index.ts:696-710` 使用 `--mode json -p --no-session`；`:1441` spawn 外部 CLI；`:1772-1779` 注册 trellis_subagent | 不创建可被本 Web registry/默认持久化目录发现的孩子；它自己的 progress card 与顶部 family 是不同机制 | S/L |
| legacy `pi-subagents` / 其他扩展 Agent | 名称不能证明写入协议、目录或 registry 一致；本机当前配置未发现已安装的 legacy 包 | 只有输出符合上述关系协议且能被扫描的孩子才兼容；纯工具结果、独立进程、其他 customType、其他 sessionDir 均不足 | S（协议）/H（具体扩展） |

内置开关由 `lib/subagent-settings.ts:15-41` 读取 `~/.pi/agent/agents/settings.json`，缺省 false。`lib/subagent-extension.ts:97-111` disabled 时不注册工具；`:244-275` 仅在 host 有 Agent 时抑制**被识别为 legacy 的**重叠扩展，绝非把所有同名工具都转换为 Web 子代理。带 scope 的第三方包也不能只按名字假设命中识别逻辑。

`docs/adr/0003-built-in-subagent-toggle.md` 明确：关闭开关不取消已运行孩子，也不禁止读取历史。因此“关闭工具后历史入口仍在”是符合设计的。

**瞬时失败例外（S/H）：** `lib/rpc-manager.ts:2036-2041` 排除未落盘且不在运行/没有首条 user message 的 wrapper。若孩子在首次持久化前失败、结束，其 transient 摘要可能从 API 消失；这不同于正常已持久化 completed 被过滤。本次未运行真实失败任务验证。

## 4. 场景检查表

| 场景 | 预期/风险 | 验证程度 |
|---|---|---|
| 新建空父会话、启用工具但从未创建孩子 | 无入口；开关不决定入口 | S/T |
| 内置孩子运行跨过 poll、ID 未知 | poll 引发结构刷新；项目正确、请求成功后显示 | S/T（谓词） |
| 内置短任务在两次 poll 间创建并完成 | 可能持续无入口；父完成单行刷新无效 | S/T（纯函数充分复现），无浏览器实测 |
| 已采样后台孩子完成 | 仍 refresh，即使通知 suppressed；持久化关系保持入口 | S/T |
| 已加载持久化孩子正常完成/失败/终止 | 状态变化不隐藏入口 | S/T |
| 初始 transient 孩子未落盘就结束 | 可能从目录消失 | S/H |
| 当前选中的是孩子并完成 | completedInBackground 排除选中 ID；正常持久化项仍保留；未加载祖先则没有 family | S/T |
| 页面刷新 / URL 历史恢复 | 初始隐藏→父所在项目加载后出现；不保证“首次 render 即有” | S/T |
| 同项目切换到另一 main/fork | 只显示所选 family 的孩子；原父孩子不继承给 fork | S/T |
| 同项目切回原父但此前漏刷 | 缓存命中，不保证自愈 | S/H |
| 跨项目切换 | 首访/stale 重拉，已缓存非 stale 不拉；其他项目旧行保留 | S；H（现场时序） |
| 侧栏项目与选中聊天不同 | refreshLists 刷侧栏项目，不一定补齐当前聊天 | S/H |
| 隐藏 tab 期间完整运行 | 没有采样；回来若无可见运行边沿，仍可漏刷 | S/H |
| 手动刷新正确项目 | projects force 成功→项目列表新快照，通常补齐入口；其他错误/关系不兼容不能靠刷新修正 | S；未调用真实 API |
| 关闭内置开关，恢复历史孩子 | 已识别历史仍显示；不是工具开关 indicator | S/T（无状态筛选） |
| trellis_subagent | 不持久化，不形成 family 入口 | S/L；未执行真实子任务 |
| 外部 Agent、跨目录或不同 metadata | 未满足协议不能识别；祖先不在目录也不能组成 family | S/T（协议及缺祖先），具体扩展 H |

## 5. 本次测试与本机只读证据

### 5.1 已运行测试

1. 命令：`JITI_FS_CACHE=false node --experimental-strip-types --test lib/session-family.test.mjs lib/subagent-extension.test.mjs`
   - **14 tests / 14 pass / 0 fail**。
   - family 两例覆盖嵌套聚合、选中后代、孤儿/环；extension 十二例覆盖禁用开关、Agent 前后台、结果/steer、legacy precedence 等。
   - 使用 mock runtime，不实际创建子代理；禁用 Jiti 文件缓存。没有跑会写真实状态的应用 API，没有 next build、没有启动/重启服务器。
2. 通过 shell stdin 运行内存脚本，`createJiti(import.meta.url, { fsCache: false })` 导入真实 `getSessionFamily`、`readSubagentRun`，并从侧栏源码提取 `completedInBackground`、`newlyRunning`、`hasUnlistedRunningSession` 的实际表达式进行求值。**12/12 检查通过**：
   - 空 catalog + 恢复父隐藏；加载完整 family 显示；四种完成状态保留；切无关 session 隐藏再切回显示。
   - 选中孤儿隐藏；补祖先恢复；普通 parentSessionId/fork 不算孩子；单行父 patch 不发现新孩子。
   - `{P}→{P}→{}`（选中 P、孩子运行未被采样）两次均不 refresh。
   - 未知 C 出现触发 refresh；已采样后台 C 完成触发 refresh。
   - C 已在全量已知 ID 集合时，首次 running 不触发目录刷新。
   - 非 pi-web customType 拒绝；合法 pi-web metadata 识别且无结果时为 interrupted。
   - 此脚本只执行纯函数/表达式；**不是 React effect 集成测试、不是浏览器端到端复现**。

用于复核漏刷的核心输入：

```text
previous={P}, now={P}, known={P}, selected=P => refresh=false
previous={P}, now={},  known={P}, selected=P => refresh=false
previous={P}, now={P,C}, known={P}, selected=P => refresh=true
previous={P,C}, now={P}, known={P,C}, selected=P => refresh=true
previous={}, now={C}, known={P,C}, selected=P => refresh=false
```

### 5.2 脱敏本机样本（L）

只读全局与项目配置中的 package/extension 来源、内置开关，未输出配置全文/凭据。当前 `builtInEnabled: true`；项目设置加载 `./extensions/trellis/index.ts`。检查到的当前配置没有 legacy pi-subagents 包；这**不证明历史上没有使用过，或其他进程的已加载扩展相同**。

对默认 `~/.pi/agent/sessions/*/*.jsonl` 做有界只读扫描：每文件最多前 256 KiB，只检查前 40 行的 metadata；报告仅统计，不记录 ID、路径、任务/聊天正文。

| 统计 | 值 |
|---|---:|
| 枚举文件 | 164 |
| header 含 parentSession | 14 |
| 发现 pi-web:subagent 元数据 | 13 |
| 满足 version/parent 字符串校验 | 13 |
| metadata 行位置 | 全部第 2 行 |
| 有 metadata 但无 header parentSession | 0 |
| metadata 指向不在所扫描 header 集合的父 ID | 0 |
| 父子 cwd 不同 | 0 |
| 当前项目 cwd 的孩子 | 1 |
| header 读取/解析失败 | 0 |

样本支持“本机确有标准内置持久化孩子，且开头关系协议正常”，**没有捕获入口丢失的当时目录、running 时序或浏览器状态**。扫描未覆盖自定义 sessionDir、深层/其他用户目录、前 40 行之后的元数据；不能将零异常外推为所有历史均无异常。

### 5.3 历史依据与边界

已阅读 `trellis-session-insight/SKILL.md`。规范、当前源码和 ADR 已提供直接证据，因此按 skill 的“不为源码问题额外挖聊天”原则，未调用 mem 索引/提取原始会话。只读 git 历史确认 family 引入提交 `e4b4743`、内置开关 ADR 提交 `0d2930f`，当前刷新实现处于 `8e49a9d`。不能仅凭提交标题推断用户当时使用哪种工具。

为避免读操作触发磁盘缓存保存/恢复 wrapper，本次**没有请求本地 sessions/projects/events API**（列表扫描会 best-effort 写 cache；SSE 可能恢复 runtime）。未修改业务代码、配置、会话数据；仅写本任务文档，无 git commit。

## 6. 最小修复建议（均需另行批准）

### 优先 A：补可靠的结构变化发现，而不是永久显示按钮

- 在现有轻量 running poll 中消费一个**真正的结构版本/受影响项目标识**，变化后 invalidate 前端项目缓存并刷新必要项目/family；保持按需加载、旧行可见、同 key 序号、串行刷新和 overrides 保护。
- **不要直接“sessionListVersion 一变就 refreshLists(true)”**：当前版本也因普通 `agent_end`、force 读取而递增（`lib/rpc-manager.ts:328`、`lib/session-reader.ts:342,479-486`）。这样会把单行优化退回全量扫描，甚至 force 自己制造下一次版本变化，形成刷新循环。要区分结构变化或制定不会自激的版本/非 force 消费协议。
- 更局部的替代：内置子创建/完成向父 UI 提供明确 family invalidation，定向拉孩子/族并 upsert，避免全量扫描。不过仅监听当前父 SSE 不能覆盖历史恢复、后台隐藏或跨窗口；应有持久的 version/重连补偿。
- 不建议以“每次父 agent_end 都全量 force”作为最终修复；性能约束与已读规范明确不支持这种退回。

### 优先 B：把 family 加载与侧栏浏览位置解耦

若需要消除恢复/跨项目导致的长期缺族，增加按 selected session 查询族/补祖先的定向路径；至少确保结构刷新覆盖 selected family 所属项目，而非只刷新侧栏当前项目。首次加载的短暂隐藏可用明确 loading 表达，但不能谎称没有孩子。

### 优先 C：明确扩展兼容范围

- trellis 的 `--no-session` 是当前工具设计，不应通过改全局开关来“修复”入口。若要支持其运行信息，应另行设计 adapter/展示来源，而非伪造 Web 持久化 family。
- 若计划兼容其他 Agent 包，先采样其真实 header/customType/sessionDir，再做显式 adapter。不要用工具名或任意 parentSession 推断 subagent（会把 fork 错归类）。
- 列表/详情元数据读取边界不一致可作为兼容性修复，但当前本机 13 个样本无此异常，不应优先假定它是用户根因。

建议回归：短生命周期、后台 tab、已知 ID 未加载摘要、选中父/子各自结束、侧栏项目与 selected 分离、同/跨项目缓存、初始 URL 恢复、祖先缺失、正常完成不隐藏、transient 未落盘失败、关闭开关读历史、trellis/legacy 工具来源、版本消费不自激、普通父结束仍只定向读取、请求乱序/失败保留旧目录。

## 7. 未决问题与风险

1. 用户那次“消失”是从未出现，还是同一父会话已显示后消失？是否执行 trellis_subagent，是否切项目/刷新/后台 tab？需要最短操作序列，不需聊天内容。
2. 当前调查针对仓库源码。没有确认浏览器实际连接的服务进程、已安装发行包与 `8e49a9d` 完全相同；本机存在已安装 Pi Web 发行包，不能拿仓库行号当作部署一致性证明。
3. 没有浏览器网络与 state 快照，无法衡量哪个原因发生最频繁；纯函数测试只证明充分条件，未证明用户现场命中。
4. 若已加载的持久化完整 family 在不切会话时消失，需要抓脱敏的 selected ID、项目 key、catalog IDs/relation、running snapshot、版本与请求顺序；不能仅记录按钮截图。
5. 现有 SDK 外部扩展 Agent 的历史实现未获取；本项目 trellis 的行为已经源码确认，其他包保留待验证，不泛化为“所有扩展都不支持”。

**原调查验收：AC1 数据链路及行号、AC2 场景/证据分层、AC3 原因/未决/最小建议均已形成。当前扩展范围以 PRD 为准；最终规划待审批，尚未进入实施。**

## 8. Pi-web-only Trellis adapter: follow-up research and final planning

### 8.1 Confirmed source contract (S)

- `.pi/extensions/trellis/index.ts:111-157`: `ProgressDetails.kind=trellis-subagent-progress`, modes single/parallel/chain, final flag, timestamps and runs. Run statuses are pending/running/succeeded/failed/cancelled. A run has agent, prompt excerpt, optional step, finalText, text/thinking/stderr tails, tools, usage and optional model/settings/error.
- `:551-579`: run IDs are agent plus ordinal, reused across invocations; prompt is already truncated to 120. `cloneProgress` copies runs/tools/usage. Identity must therefore include parentSessionId and toolCallId, not just run.id.
- `:1553-1587`: partials are full cloned snapshots with stable content `subagent running`, not text deltas; finish sets final:true. Throttling is 500ms (`:98,1576-1581`), not a heartbeat; lack of updates does not prove death or life.
- `:1591-1661`: parallel initializes all runs, chain appends steps sequentially and stops on failure, single has one run. Do not fabricate unstarted chain steps; count runs, not calls.
- `:89-95,1308-1390,1428-1524`: stdout/stderr buffers, 256 KiB tails, 256 tools and 2,048-character args are producer bounds; finalText is not a complete transcript and may be large. Run status can become succeeded at child agent_end before the subprocess closes, so even terminal run status should be presented as a reported outcome, not a process oracle. `:1879-1882` returns result.details; `:1957-1966` tool_result hook marks failed/cancelled Trellis runs as outer isError. Do not rely only on outer isError for each run.

### 8.2 Live bridge: details arrive, but no top-level consumer exists (S)

| Boundary | Evidence and consequence |
|---|---|
| Tool -> agent core | Installed pinned `node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:460-480` forwards onUpdate as partialResult; `:532-554` emits tool_execution_end.result and creates toolResult with details. |
| SDK -> wrapper | `lib/rpc-manager.ts:325-331,576-580,639-642` subscribes and forwards events. No Trellis-specific filtering. |
| Wrapper -> SSE | `lib/agent-event-wire.ts:87-95` preserves partialResult including details; `lib/agent-event-stream.ts:60-69,90-110` serializes and forwards. The reconnect snapshot is only streamingMessage plus connected/isStreaming, not tool progress replay. |
| SSE ownership | `lib/agent-event-connection.ts:140-168` drops callbacks from a discarded connection; error discards/retries. It does not provide durable tool replay or branch identity. |
| Hook | `hooks/useAgentSession.ts:1300-1330` extracts a string through `lib/tool-execution-progress.ts:7-30`, puts it in agentPhase and removes it at tool end. No structured Trellis records survive this phase. `:1259-1285` appends normalized tool-result message on message_end. |
| Hook -> ChatWindow | `components/ChatWindow.tsx:242-299` forwards existing branch/system callbacks, receives agentPhase for `:1232-1234`; a scoped Trellis callback is missing. |
| ChatWindow -> shell | `components/AppShell.tsx:124-140,334-338,1526-1564,2244-2253,2483-2499`: only session family drives entry, count, automatic close and panel render. Merely retaining details in chat cannot change visibility. |

### 8.3 Final details survive storage and UI history normalization (S/T)

1. SDK agent-core constructs `toolResult.details=finalized.result.details` (`dist/agent-loop.js:542-554`). Extension result/message hooks can intentionally replace details; the adapter cannot reconstruct what was removed.
2. Pinned SDK `dist/core/agent-session.js:383-399` emits to subscribers and then appends the final toolResult on message_end. This means an immediate HTTP read can lag the event; do not erase the just-received final snapshot with a slower/older response.
3. `dist/core/session-manager.js:739-790` wraps the message without whitelisting and persists JSON.stringify(entry). Partial updates are not appendMessage entries. No new persistence format is needed.
4. `lib/normalize.ts:45-65` returns non-assistant messages unchanged. `lib/types.ts:83-89` already permits details?: unknown.
5. `lib/session-reader.ts:573-574,612-642,653-677,698-747,753-771`: reads SDK entries; slices the requested ancestor path; converts tool results unchanged except lazy media content rewriting via object spread. Thinking deferral only affects assistant messages. Details survive both options.
6. `app/api/sessions/[id]/route.ts:38-52,97-108` and `context/route.ts:34-47` return this context; `hooks/useAgentSession.ts:486-496,548-569` install context.messages directly.

**Important coverage gap:** both history endpoints default to 50 entries. Details survive when their message is included; this does not mean all records are visible at initial restore. A bounded full-active-branch projection over already loaded entries is needed for a reliable top entry, independent of chat pagination. Do not scan every session or return unbounded raw details a second time.

### 8.4 Isolation gaps the implementation must address (S/H)

- ChatWindow is keyed by sessionKey (`AppShell.tsx:2483-2484`), and hook cleanup closes SSE (`useAgentSession.ts:1987-2042`). Useful session isolation, but not sufficient for callbacks published into AppShell or branch navigation within the same mount.
- `loadSession` checks only sid on success (`:486`); its 404 and catch/finally paths lack equal ownership guards. `loadContext` checks sid/mounted/optional abort (`:549`) but not the requested leaf or request sequence. `handleNavigate/handleLeafChange` (`:1566-1586`) change leaf before awaiting a response. Two same-session branch requests can arrive out of order. This is a source-level race path, not a reproduced browser defect in this investigation.
- `loadContext` omits leafId for null; context route falls back to the last entry through the reader when leaf is undefined. Explicit root/default-leaf semantics are required for the new projection. Invalid leaf must not silently fall back to another branch.
- Parent running polls, connected.isStreaming and agentPhase do not establish Trellis subprocess liveness. Existing `agent_end` is not prompt settlement (`:1154-1209`). Final planning uses qualified snapshot statuses, with no Trellis running spinner/count and no inference from parent activity.
- Result deduplication needs parentSessionId + toolCallId + run.id, plus local view-generation/request/event ownership for race rejection. The latter is client cancellation state, not the deferred structural version protocol.

### 8.5 Documentation and test evidence

Read applicable skill contracts and frontend specs: session-list-refresh; hook/component/state/type/quality indexes (the general guides are placeholders); shared cross-layer and code-reuse guides. `get_context.py --mode packages` confirms a single-repo frontend spec layer.

Pi documentation was read from the explicitly provided installation root:

`/home/xupeng/.local/share/mise/installs/npm-xup3ng-pi-web/0.9.2/node_modules/.mise/@earendil-works+pi-coding-agent@0.85.1/node_modules/@earendil-works/pi-coding-agent/`

Read `docs/sdk.md`, its relevant `docs/extensions.md` and `docs/session-format.md` cross-references completely, and `examples/sdk/11-sessions.ts` (read only, not executed). Relevant contracts: tools emit partials separately from final messages, parallel execution-end order can differ from final message order, details support branch reconstruction, and subscriptions belong to a particular AgentSession. Local pinned dist source was checked to verify actual saving behavior. No SDK runtime creation, extension execution or TUI implementation was performed.

Executed:

```sh
JITI_FS_CACHE=false node --experimental-strip-types --test lib/normalize.test.mjs lib/tool-execution-progress.test.mjs lib/agent-event-wire.test.mjs lib/agent-event-stream.test.mjs lib/agent-event-connection.test.mjs lib/session-family.test.mjs components/AgentSessionPanel.test.mjs hooks/useAgentSession.test.mjs
```

**60/60 passed.** This includes pure functions, mocked transport and source-contract assertions; it is not new-feature or browser verification.

An additional stdin-only synthetic probe used SessionManager.inMemory, appendMessage, JSON stringify/parse, actual buildSessionContext with deferThinking/deferToolResultImages, normalizeToolCalls and toClientAgentEvent. For each of single/parallel/chain it verified history details, normalization and wire JSON preservation: **9/9 passed**. No session files were written. This confirms serialization/conversion, not a real subprocess/persisted disk round trip; the latter is an implementation acceptance test in isolated temp storage.

`e2e/README.md` establishes Playwright fixtures in a temporary PI_CODING_AGENT_DIR with its own server; it must run in a separate idle checkout if this checkout has an active server. `e2e/run.mjs:330-348` already uses route interception/delayed history responses, suitable for deterministic branch races and synthetic SSE. Existing hook/panel tests are mostly source assertions; do not use those alone to claim lifecycle correctness.

Tooling note: bundled rg currently fails with Exec format error. Research used system grep/find via bash; no global binaries/configuration were changed.

### 8.6 Requirement mapping and disposition

| Requirement | Evidence / design disposition |
|---|---|
| R1 / AC1 | Original sections 1-2 plus 8.2 bridge table. |
| R2 / AC2 | Original scenario matrix; 8.3 pagination and 8.4 ownership add restore/branch/reconnect coverage. |
| R3 / AC2 | Original source contrast plus 8.1 contract; built-in sessions and Trellis snapshots remain distinct. |
| R4 / AC3 | Original conclusions retained. Earlier section 6 structural-version recommendations are explicitly deferred, not part of this implementation. |
| R5 / AC4 | Shared entry with source-separated panel, current-parent viewed-branch scope. |
| R6 / AC5 | Full bounded branch projection; stored details preservation is confirmed, partial durability is not claimed. |
| R7 / AC6 | Tuple identity, scope generation, request/event watermarks, owner-checked shell callback. |
| R8 / AC7 | Shared bounded unknown decoder; all three modes; missing/unknown details fallback. |
| R9 / AC8 | Qualified snapshot statuses, read-only details, truncation labels, no fake sessions/actions. |
| R10 / AC9 | Existing built-in flow unchanged; no Trellis/registry/list/version changes; isolated tests and approval gate. |

Final implementable proposal and validation matrix are in design.md and implement.md. Product decision blockers: none for presenting this proposal; final approval is still required. Scope/status/count/retention behavior is explicitly presented for that review, not silently treated as already implemented.


## 9. Implementation record (2026-09-11, approved)

The user approved the final planning summary ("好的，继续") in the main session, superseding the earlier `awaiting approval` wording. Implementation proceeded without stopping again at the planning gate.

### 9.1 Shipped artifacts

New:

- `lib/trellis-subagent-records.ts` — single contract owner: exact tool/kind gate, bounded `unknown` decoder, collision-free `JSON.stringify([parent, toolCallId, runId])` identity, evidence-rank merge store (`history` base + live overlays, watermark reconciliation), `selectTrellisRecords` retention (100 records) and 512 Ki-character text budget.
- `lib/trellis-subagent-history.ts` — full requested ancestor-path projection from already-loaded entries (single ID map, cycle guard, `null` = explicit root, invalid leaf = empty), plus a `context messages` best-effort fallback for older API responses.
- `components/TrellisSubagentRecords.tsx` — read-only expandable snapshot section; qualified `Last reported` statuses, snapshot/coverage/truncation/stale labels, no session controls or URLs.
- Tests: `lib/trellis-subagent-records.test.mjs` (30), `lib/trellis-subagent-history.test.mjs` (9), `lib/trellis-subagent-persistence.test.mjs` (3, real temp-dir `SessionManager` write → reopen → `buildSessionContext`), `components/TrellisSubagentRecords.test.mjs` (6, `renderToStaticMarkup` DOM), `hooks/useAgentSession.trellis.test.mjs` (7 wiring guards).

Modified:

- `app/api/sessions/[id]/route.ts` — additive `trellisSubagentRecords` envelope over `sm.getLeafId()`; chat tail untouched.
- `app/api/sessions/[id]/context/route.ts` — additive envelope only off the `before` pagination path; explicit `root=1` → `null` leaf for both context and records; effective leaf passed explicitly.
- `hooks/useAgentSession.ts` — separate `useReducer` Trellis store (generic `agentPhase` untouched); per-request `sessionReqSeqRef`/`contextReqSeqRef` guards on success/404/error/finally; synchronous branch reset before await; branch-owned live-event gating (`trellisAllowedCallsRef` + latest/active leaf refs); `history`/`event` reconciliation with event watermark; scoped `onSubagentRecordsChange` publication and owner retirement on unmount.
- `components/ChatWindow.tsx` — typed callback pass-through only.
- `components/AppShell.tsx` — owner-filtered snapshot state, `hasSubagentsEntry = built-in children || Trellis records`, combined count, fallback main row, panel composition.
- `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` — 34 `trellisSubagent.*` keys each.
- Wire/route/toolbar tests extended: Trellis details survive `toClientAgentEvent`; route envelopes and `root=1`; combined Agents toolbar predicate.

Excluded, unchanged: `.pi/extensions/trellis/**`, `lib/session-family.ts`, registry/rpc-manager, list-version protocol, global settings, real user session data.

### 9.2 Verification actually run

- Feature + persistence + component + wiring: **55/55 passed** (`JITI_FS_CACHE=false node --experimental-strip-types --test lib/trellis-subagent-records.test.mjs lib/trellis-subagent-history.test.mjs lib/trellis-subagent-persistence.test.mjs components/TrellisSubagentRecords.test.mjs hooks/useAgentSession.trellis.test.mjs`).
- Full isolated suite (`PI_CODING_AGENT_DIR=$(mktemp -d)`, all `app/components/hooks/lib/public` tests): **1151/1151 passed**.
- Original 60-test baseline remains **60/60**.
- `node_modules/.bin/tsc --noEmit --incremental false`: clean.
- `npm run lint`: **16 pre-existing `react-hooks/preserve-manual-memoization` errors** in `ChatInput.tsx`, `ChatMinimap.tsx`, `SessionSidebar.tsx`, `useAgentSession.ts`; the same 2 errors pre-exist in `useAgentSession.ts` on `HEAD` (verified against `git show HEAD:hooks/useAgentSession.ts`). New files lint clean.

### 9.3 Explicitly not done / residual risk

- Browser Playwright verification (`npm run test:e2e`) was **not run**: this checkout has an active `next-server`, and the e2e doc requires an idle disposable checkout because Next uses a shared build lock. No real Trellis subprocess/model call was made.
- A→B→A and X→Y→X request races are covered by the pure reducer plus source-level wiring guards, not by a live React/browser harness. This is the main remaining acceptance gap.
- Relay: partial updates are not durable; a full reload can lose partial-only records (shown stale/unavailable when only observed in-memory). Producer/heartbeat unchanged by design.
