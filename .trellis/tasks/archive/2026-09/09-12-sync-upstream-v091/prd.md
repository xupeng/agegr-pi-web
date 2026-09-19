# 同步上游 v0.9.1

## 目标与用户价值

将固定上游更新安全整合到 personal，获得上游子代理、会话保活/恢复及 UI 修复，同时保留全部现有 personal 定制和已验收的 Trellis 执行快照。先在独立 worktree 验证，避免合并冲突、测试数据和构建产物污染正在运行的主 checkout。

## 已确认事实

- 本地 L：`fdb21ff968b7d99e38aae0a9901f28206d3e5258`；上游 U：`8366762fa4b4ef3327f1b19e8ff7bf891a14c06c`；共同祖先 B：`a26cc68df9227cb74253bddd7c59624aa475e61f`。不自动纳入后续提交。
- B→U 共 34 个提交、79 个变更路径；B→L 共 311 个净变更路径（含历史/工作流及删除项）。双方重叠 27 个文件，最后 Trellis 提交与 U 重叠 10 个文件；merge-tree 核实真实文本冲突为 10 个文件，不能混用这三个统计。
- 上游包版本为 `@agegr/pi-web@0.9.1`；本地包及上次历史 npm 发布为 `@xup3ng/pi-web@0.9.2`，两条版本线独立。三方 Pi SDK 均为 0.85.1；上游 package-lock 仅变更根版本元数据，未改依赖；上游无 pnpm-lock，本地保留已有锁。历史发布证据来自只读会话检索，不冒充本次 registry 核验。
- 前一任务报告：68 focused、150 related、1164 全量 Node tests 和类型检查通过，Trellis 桌面/移动专项 E2E 通过；16 项 lint 错误及原全量 E2E `e2e/chat-appearance.mjs:88` 外观 hit-test 失败曾对照旧 HEAD 复现。本次尚未运行测试，必须重验，不能继承“通过”或自动豁免。
- 主目录存在 dev server（研究时 :8505），另有已安装 0.9.2 服务（:26812）；默认脚本端口 30141 不足以识别现有服务。PI_CODING_AGENT_DIR 不隔离 HOME 附件目录、项目根和凭据环境，验证还需临时 HOME/fixture project。具体证据与完整清单见 research/merge-plan.md、research/inventory.md。

## 要求

- **R1 固定目标与保留清单**：按 research P01–P14 逐项保留 fork 包/发布配置、字体与字号迁移、表格/代码、移动键盘与设置、图片存储/路由、扩展可见性、ask_user、增量缓存/侧栏、Trellis 快照及工作流历史。已撤销的 Electron safe-area、旧字号控制器与已删除 scanner 不复活。所有净变更路径可追溯，而非仅审最后提交。
- **R2 双方行为整合**：普通 merge 保留历史；人工处理 10 个冲突及自动合并文件的语义风险。接受上游队列/resume/worktree/profile、lease/流恢复、模型/额度、插件、UI、推送与测试文档更新；压缩响应保留 Trellis envelope/定向查会话；后代删除同步清理对应 ask，普通 fork 不误删。
- **R3 Trellis 兼容**：保留有界投影、精确 tool+kind、当前分支/root/分页语义、证据优先级与 watermark、请求/SSE/回调所有权及只读 Last reported。上游新增活动工具 replay 不得放宽分支归属或伪装持久化/活性；主动导航与被动历史 settlement 区分。真实 built-in 会话与 Trellis record 不混为一体。
- **R4 隔离与版本**：独立 candidate/baseline 源码、node_modules、.next、测试产物、数据/HOME/fixture git repo 与动态 localhost 端口；不共享主目录可写依赖、不触碰真实配置/会话/附件/凭据。保留本地版本和 SDK/锁依赖，不执行 next build 或发布脚本。
- **R5 验证与门禁**：相同环境重跑 L 与候选的类型、lint、全量 Node、原全量 E2E 和独立 Trellis E2E；补专项浏览器矩阵（桌面/移动/触屏平板）。逐条对照旧 lint/外观失败，新增失败阻塞；未执行阶段与设备限制明确报告，不降级断言冒充通过。
- **R6 文档与整合**：当前任务文档始终以主 checkout 为权威，实施代码在 worktree。验证后另获提交/整合授权，采用 design 的候选代码合并 M、主目录任务文档提交 D、候选整合 D 得 I，再 ff personal 的安全路径。ff 前重查 HEAD/index/工作区/祖先/文档一致性并保留回退点；任何并发改动停止，不强推引用或擅自 stash/reset。

## 验收标准

- **AC1（R1）**：固定目标、全部本地定制、34 个上游提交、真实文本/语义冲突均有证据与保留检查记录。
- **AC2（R2、R4）**：候选普通 merge 无未解决冲突，U 成为祖先；包身份/版本/SDK/锁保持决策，双方行为兼容；主 checkout 在验证期间不受中途冲突、依赖、.next 或测试数据污染。
- **AC3（R5）**：记录真实命令/版本/退出码、单测数量、逐条 lint 对照、原与专项 E2E 桌面/移动结果；新增问题无未解决阻塞项。相同基线失败若仍存在，明确报告并在最终整合前获得用户接受，不声称全量通过。
- **AC4（R1–R3、R5）**：P01–P14 全部有验证结论；重点证明 lease/replay/流恢复与 Trellis 分支隔离、后代删除与 ask/历史投影、Settings 调整与 records-only 入口、图片/触屏输入/缓存/profile 兼容。
- **AC5（R6）**：主目录任务文档完整纳入安全整合，personal 仅在批准后从已核对 D ff 到已验证 I，保留可追溯回退点；提前说明最后更新源码会触发当前 dev server HMR/重编译，不承诺永远不影响服务，也不擅自重启。

## 非范围与风险

- 本阶段仅研究与规划：不 start、不建 worktree、不实施 merge、不提交、不改业务代码。
- 整个任务不 push、不发布 npm/打 tag、不 next build、不动现有服务、不更改真实用户数据、不重写历史、不 archive 09-09 或 09-11 任务、不升级 Trellis。
- 不新增子会话结构版本协议、producer 持久化重放、全量历史无界扫描或无关重构；内置短生命周期 sampling gap 仍延期。
- Chromium 与 Playwright revision/Node CI 版本可能不一致；桌面/移动 viewport 不等于真实 iOS/WKWebView 或推送交付。不能验证的环境项明确列为风险；需要扩大范围时重新批准。
- 最终 HMR 可能保留旧 globalThis wrapper，不能承诺运行中实例全部即时升级；重启/回滚另行授权。

## 状态与审批

**2026-09-13 后续授权与新鲜验证（pre-D/pre-ff）：** 用户已接受既有 lint/原 E2E/环境限制并授权 M/D/I 与 personal ff/HMR，无新授权需求。本次当前快照重新验证：1222 unit、tsc、Trellis 三尺寸连续两次通过；14 lint 与已接受诊断逐字一致；原 E2E 本次完整通过，但不消除下述历史时序失败。快照 SHA-256、验证 tree 与命令见 `research/revalidation-report.md`。本段写入时主业务代码仍为 L，尚不宣称 ff 完成；最终真实结果仅写隔离目录外部 operation 报告。以下状态保留为先前独立检查历史。

**checked and fixed (isolated) - 可请求整合审批，但尚未获准提交或整合。** 独立 `trellis-check` 已按真实 `check.jsonl`、PRD/design/implement/spec 上下文复核 27 个重叠文件、10 个文本冲突文件、P01-P14、3 个 post-merge follow-up 及 staged/unstaged 状态，并直接修复发现的问题。候选分支 `merge/upstream-v091-20260912-200432` 仍为未提交普通 merge：`HEAD=L`、`MERGE_HEAD=U`、77 个 merge 路径 staged、15 个经审查 follow-up 路径 unstaged、0 个未解决条目；主 checkout 业务代码仍为 L，仅本任务目录为 untracked。

关键修复包括：DELETE 等待 queued/running/resume 后代 settlement 与真实 worktree 清理、失败时 500 且不 unlink/清 ask；普通 fork 与其子代理保留；profile 编辑/启停保留 `extensionTools`/`color`/`isolation`/`persistSession`；StrictMode 首次 SSE 自然恢复；reconnect 保留当前 view 已授权 active-tool replay union，并仅在 snapshot 确立 ownership 后释放有界预缓冲；拒绝 stale branch navigate 和 stale model restore；gzip detail 明确验证 Trellis envelope；404/Settings harness 不再靠宽松延时或错误滚动掩盖问题；744x1133 `hasTouch` 浏览器验证 coarse pointer 与 Enter 换行。

最终独立验证：tsc 通过；全量 Node **1222/1222**；checker 修改的生产文件 focused ESLint 全过；全量 lint 为 **14 个**继承的 `react-hooks/preserve-manual-memoization`（基线 L 为 16，候选无新增，hook 的 3 个合并后错误已清除）；Trellis E2E 最终行为在 1280/744-touch/390 矩阵连续两次通过；修正后的 chat-appearance targeted flow 在候选与 L 均通过。原 `e2e/run.mjs` 仍未全绿：候选两次及独立 L 重跑均在历史分页/minimap dev 时序族中提前失败，因此不宣称全量 E2E 通过。仍保留 Node 26 vs CI 22.19、Chromium cache rev 1234 vs 预期 1243、未执行 `next build`/production start、真机 iOS/物理 paste-drop/push/provider/HMR 旧 wrapper 等限制。完整结论见 `research/check-report.md`。

**门禁：代码复查 PASS；整合门禁 CLOSED。** 后续只有在用户明确接受上述继承性 lint/原 E2E 与环境限制，并明确授权 `M`/`D`/`I` 提交拓扑和 personal ff/HMR 窗口后才能执行。当前不 commit、不 ff、不 push、不发布、不 build、不重启服务。
