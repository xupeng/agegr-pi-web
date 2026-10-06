# 系统安装与并立 host：用户澄清（2026-10-06）

## 权威决定

用户原话：“不能和使用系统安装的版本吗？pi web 中的投影实现和 tui 一样，是并立关系”。明确使用 Pi 系统已经安装、经 SDK 按原配置发现的工具；Web/TUI 是同一外部核心的两个宿主投影。

助手前轮把“依赖外部”理解成固定 tarball npm 生产依赖，并提出隐藏系统包，是误读，不是用户决定。该提案、额外包根 resolver、additional entry、SettingsManager 资源 facade 和 SHA 绑定全部撤回。external-dependency-options/service-boundary 保留为历史备选，不应再注入实施上下文或执行。

后续用户又明确自动发现后移除 Web 开关：Web 专用 UI/API/helper/env 全退役，保留 SDK 原工具选择与宿主执行边界；见 system-discovery-no-web-switch.md。本文件早期“Web gate”仅指原事故或执行边界，不是继续保留专用开关。

## 已有依据与缺口

- 当前系统配置已安装外部工具；SDK loader 实际 first-wins，外部 execute 已成为 owner。研究 loader-source-and-minimal-plan.md 第 1–5 项有代码锚点。无需另一份 npm 依赖才能使用它。
- 外部 index.ts:20-33 在调用时走 loader bridge；bridge.ts 要求唯一同步注册 host，TUI fallback 只限 ctx.mode=tui && ctx.hasUI。Web extension.ts:25-35 直接注册自有工具而无 listener，才产生 got0。
- 因此用同 loader 的 Web bridge-only host 接住现有外部工具解决“谁提供工具”；还需 model-only/主会话边界，删除 Web 专用设置/env gate，不能把移除开关误作移除执行约束。
- 外部未声明 model-only，由 Web 工具级定义投影强制，execute/schema/prompt/source 仍来自系统工具；不改 TUI 进程中的同一包。

## 编译期与运行时不可混淆

Web 不应静态 import 任意系统安装目录。外部工具运行时已校验模型参数、解析 bridge 并校验 ack；Web 只实现 host 侧版本化 DTO/解码、浏览器答案校验、pending 状态/UI/交付。这些是投影契约，不是重新注册第二个工具。

去内置意味着移除 Web tool factory/schema/prompt/execute、本地包入口与 bridge resolver/caller；不是不加区分删除所有 DTO、校验与格式化，后者有宿主责任。现有 portable 使用者须分类迁移并集中定义 Web contract，客户端不导入 SDK/TUI。若实现发现必须添加外部 host 能力才可保持现有约定，回到 planning 说明，不暗中扩展跨仓范围。

## 可观察边界

- 单系统工具 + Web host：唯一工具 source 为用户安装来源，Web ask 一次，TUI 不打开。
- 无系统工具：Web 正常启动，不提供 ask_user，不 fallback；旧 pending 由 Web 状态链继续呈现/处置。
- 版本更新：按系统安装与 SDK reload，兼容按 bridge version/payload/ack，而非 Git SHA；不兼容拒绝，不报告 posted。
- 实际多个不同工具源：工具级 fail closed，不 silently first-wins；不宣称加载后 Map 投影阻止了 factory 初始化。
- 真实配置与 SDK trust/scope 不变；不自动安装/删除/隐藏用户包、不启动/重启服务。
- Web/TUI 架构并立，不代表已经共享 draft/pending/outbox 或拥有相同可靠性保证。本任务仍保留 Web best-effort mirror/fire-and-forget 边界。

本轮只修订规划与研究说明；未 start、未产品编辑、未安装/构建/模型请求/服务操作。最新 PRD/design/implement 为执行约束。
