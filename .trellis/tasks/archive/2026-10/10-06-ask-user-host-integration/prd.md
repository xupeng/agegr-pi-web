# Investigate and repair updated AskUser host integration

## Goal

直接使用系统中已安装、由 Pi SDK 按原配置发现的外部 `pi-ask-user`，让 Pi Web 投影与 TUI 投影并立，共用外部工具核心而非各自注册一份工具。移除 Web 自有工具 fallback 与专用启用开关，修复 Web host bridge，保留浏览器 UI、状态与 SDK 原有资源/工具控制。

## Requirements

- R1：使用系统已安装、经 SDK 正常发现的外部扩展作为唯一 AskUser 工具实现源。Pi Web 不再注册自有工具，也不在未安装或加载失败时回落为内建实现；不附带另一份固定版本来替代系统安装。用户已于 2026-10-06 以“开始吧”批准最终规划。
- R2：Web 模式使用自身 pending-ask / SSE / UI / submit-cancel 链，不调用原生 TUI；host 成功登记并返回有效确认后报告 posted 并终止本轮。维持现有内存权威、best-effort 磁盘镜像语义，不新增 strict-open/outbox 保证。
- R3：保留 model-only、主会话/Chat-only/子代理准入、SDK 原有资源与 active/hidden 工具控制，以及 prompt admission、supersede、reload/navigation 与 same-session 回答续跑。自动发现不等于无条件强制激活工具，不因移除 Web 开关绕过 SDK 选择。
- R4：对新版 portable 协议和 Web 行为进行差异核查，明确应投影的语义与仅属于 TUI 的交互，覆盖当前错误的集成回归。
- R5：Web 与 TUI 是同一外部 AskUser 的两种宿主投影，通过版本化协议与工具核心解耦。Web 不另行安装/锁定/遮蔽系统包，不静态导入未知安装目录作为构建前提。去掉重复工具/schema/prompt/execute/bridge caller；保留属于 Web 协议边界的 DTO/解码、浏览器命令校验、pending/outcome、答案交付与表单。真实配置不写回，CLI/TUI 不受影响；升级遵循系统安装和 SDK reload，兼容性按协议判断而非固定 Git SHA。
- R6：删除 AskUser 专用 Web 设置项、GET/PUT 设置 API、设置读写 helper 和 PI_WEB_ASK_USER 环境 gate；工具可用性只由系统安装、SDK 发现/原有工具配置和宿主执行边界决定。旧 pi-web-settings.json.askUser 字段与旧环境变量不再生效，不增加兼容隐藏开关，也不为迁移写入真实配置。

## Acceptance Criteria

- [x] AC1 / R1：记录实际扩展来源与错误根因，有文件锚点和可复现证据。
- [x] AC2 / R1-R2：在隔离的系统安装配置与真实 SDK package discovery 环境执行实际外部 AskUser，Web 中恰有一个成功登记的 ask，无缺失/重复 bridge，不打开 TUI；工具 source 保持用户安装来源，不产生 Web 附带或备用工具。
- [x] AC3 / R3：回答与取消按既有流程闭合 pending ask，并在同一会话续跑；SDK 原资源关闭/工具 inactive 或 hidden、来源冲突与错误确认不假报成功；model-only 和非主会话边界不退化，不强制回灌工具。
- [x] AC4 / R3：已有 ask-user、admission、状态恢复和 tool exposure 回归不退化。
- [x] AC5 / R4：给出新版行为投影表；运行 lock-consistent 类型、lint、相关测试与隔离浏览器验证，未运行的平台检查如实披露。
- [ ] AC6 / R5：Web 没有重复工具注册、工具核心包或固定版本生产依赖，不重写原 settings/packages 发现结果。系统未安装时 Web 可正常启动但不提供 ask_user；历史 pending 仍能呈现与处置。兼容的已安装版本经 reload 可继续使用，不兼容协议明确拒绝，不假报 posted；Web/TUI 分别选择自身 host，不交叉打开 UI。浏览器编译和 bundle 不依赖系统安装路径、不引入 SDK/TUI。
- [x] AC7 / R6：General 设置无 AskUser 专用开关、专用 reload 提示/按钮或相关 fetch；旧设置 API/helper 与三语设置文案已移除。安装并经 SDK 激活的兼容系统工具在旧 askUser:false / PI_WEB_ASK_USER=0 下仍可由 Web 正常接入；原 SDK 配置仍可让工具 unavailable/inactive。旧字段作为未知字段保留但不消费，无真实配置迁移写入，保留其他设置与表单文案。

2026-10-06 验收证据汇总见 `research/acceptance-results.md`。AC6 的实现、源码依赖边界、SDK discovery、无包/协议错误与历史 pending 已验证；production bundle/distribution 和真实 TUI UI/PTY 未运行，故不把整项勾成全部验证通过。该项继续作为发行/平台验证风险明确保留，本地实施交付与任务归档不代表发行验收通过或部署授权。其他已勾选项的错误矩阵/激活组合使用 protocol fixture，实际系统源的正向 SDK 与 Chromium 链另有独立证据，不相互冒充。用户在查看提交范围后要求“以合理的逻辑组织 commits，不留中间过程”；交付采用最终实现+测试、规范和任务记录的逻辑提交，不保留探索性/WIP提交。

## Background

- 用户授权：确认当前使用 `pi-extensions` 下 AskUser 且发生错误时，创建任务调查并修复接入；2026-10-06 的最终“开始吧”授权执行系统工具、并立 Web host、无内建 fallback、无专用 Web 开关方案，不包含部署或服务重启。
- 用户明确“使用系统安装的版本；Pi Web 投影与 TUI 投影并立”。前轮将“依赖外部”解释成固定 tarball 生产依赖是助手误读，并未获用户批准；该提案及隐藏系统包的 SettingsManager facade 全部撤回。最新边界见 `research/system-installed-host-decision.md`；旧 external-dependency 研究仅为已否决备选。
- 用户进一步明确“自动发现系统安装的工具，就可以移除 web 开关了”。删除专用 UI/API/helper/env gate；保留 SDK 原有资源与工具选择，不保留旧开关作为隐藏兼容能力。文件锚点与迁移边界见 `research/system-discovery-no-web-switch.md`。
- 本会话调用 `ask_user` 报错：`expected exactly one synchronous host bridge on "pi.ask-user.bridge:resolve-open:v1" (got 0)`，未成功发布表单。
- 全局 `/home/xupeng/.pi/agent/settings.json` 的 packages 包含 `../../dev/personal/pi-extensions/pi-ask-user`，解析到 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`。
- Web 内建 AskUser 是 fork personal 开发线的自包含实现（`64bb544`，2026-08-29），后抽出本地 portable core（`aadfb6f`，2026-09-25）；外部扩展从该核心提取并新增 TUI（`8e0db3f`，2026-10-06）。两者运行时无依赖但代码同源，已同步上游 `for-sync/main@6fcd7d4` 无此功能；证据与核查截止见 `research/code-provenance.md`。
- 外部扩展 `index.ts` 在调用时解析 loader-scoped bridge；原生 TUI fallback 仅允许 `ctx.mode === "tui" && ctx.hasUI`，不能代替 Web host。
- 外部 README 的 Pi Web 描述已与真实组合加载不一致：SDK package 先加载、inline 后加载、同名 first-wins（部署 SDK `resource-loader.js:506-512,545-585`、`extensions/runner.js:410-438`）；因此外部 AskUser 是当前 effective owner，而 Web `lib/ask-user/extension.ts:25-35` 无 bridge listener。
- 开关关闭只跳过 inline 注册，不能屏蔽外部工具；外部 `tool.ts:134-158` 缺少 Web `portable/tool.ts:139` 的 model-only。根因及部署证据见 `research/loader-source-and-minimal-plan.md`。
- 当前服务运行自包含 `/home/xupeng/services/pi-web/dist`，构建记录为 `add1e6a2`（2026-10-04）；源码 HEAD 为 `128fc3c7`。工作树修改不会自动让本会话生效；服务更新/restart 不在本任务自动授权范围。

## Out of Scope

- 不复制终端分页、按键、footer 或 TUI outbox 到 Web；不改造其他 host。
- 不移植 TUI 分支草稿、跨 host pending/draft 迁移、多行自定义编辑、存储 repair 或答案 exactly-once；差异与既有可靠性债务见 `research/projection-diff.md`。
- 不写真实 agent 配置/MCP、不在 live dev server 做变更验证、不发布版本。
- 不修改外部 pi-extensions 仓库；产品代码不得硬编码本机外部路径。
- 不添加 AskUser 固定 npm/Git/tarball 生产依赖、不自动安装、不隐藏系统包、不新增资源发现 facade。Web 不接管外部扩展版本管理；测试记录外部版本仅用于证据复现，不是产品 pin。
- 规划阶段不编辑产品代码、不 start；最终规划审批后才激活任务并执行。
