# 上游同步设计

## 基线与边界

- BASE：`8d376f3b1b98adf91f2ae651a7188745b1f563fd`，personal。
- TARGET：`6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`，上游 main。
- 共同祖先：`d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`。
- 结果分支：`merge/upstream-20261003`，以 personal 为后续 PR base；本次不自动进行远端交付。
- 最小行为差距：本 fork 缺少上游这 47 个提交提供的 MCP 管理和 SDK 升级能力；行为分别归 MCP host/config/API/settings UI 和 SDK 适配层所有，不另建替代入口。

## 合并策略

在独立磁盘 worktree 创建任务分支，使用 `git merge --no-ff --no-commit TARGET`。冲突按底层库 → API/hooks → components → CSS/i18n/tests/docs → 包配置整合，不使用 `-X ours/theirs` 或整文件覆盖。

预计改动：上游 155 个文件加必要的 fork SDK peer/测试适配、任务产物与必要契约更新。手动冲突仅限 research/planning.md 的 14 文件，自动合并的共享 owner 也必须语义复核。没有无关重构、新功能和版本发布。

## 兼容性重点

- package.json / package-lock.json：保留 fork 包名、0.12.0、homepage/repository/bugs/author、浏览器目标和发布配置；四个 SDK direct pins 升 1.0.0。portable 两个 peer pins 同步；锁文件复核并用干净 npm ci 验证，无 pnpm 锁。
- 工具：configured 默认、coding pin、active carry、model-only ask_user/Agent、read-only MCP、reload/navigation 的 loadout 契约不变；吸收上游 Code mode declarationHidden/工具描述能力。
- 提问与生命周期：接收后才关闭旧 ask，Stop 在 MCP prepare 期间保留未发送草稿与 ask；增加 slash command 的 MCP prepare 分类和 host dispose，不改变 admission 与 completion 的边界。
- SSE 与子代理：保留 Trellis structured final 窄例外、原始 inner watchdog 观测、独立快照/授权 gate、Chat-only 与子代理独立资源构造。
- UI：并存新 MCP 设置入口和 fork 设置、自定义字号、Notion 风格 minimap、移动端键盘、文件 options handler；三语 key/占位符一致。
- AGENTS.md：吸收上游 docs/agents 拆分，保留 fork 的开发/交付硬约束，不把 fork 自定义规则随上游缩减丢掉。
- 信任提示：已访问 AppendSystem pane 依赖项目 trust key，仅刷新 projectOverride；不 remount、不改 global baseline/draft，取消旧 cwd/trust 请求的所有权。
- 浏览器断言：上游将 Code mode script 放入普通工具输入框；e2e 保留脚本完整字节、嵌套调用及真实字号 setter 验证，不继续要求已删除的语法高亮盒。

## 运行与回退

依赖安装、基线和候选验证只在普通磁盘隔离 worktree 完成，测试 HOME/PI_CODING_AGENT_DIR 使用独立临时目录；不访问用户真实 MCP/凭证配置，不重启当前服务、不跑 next build。

保留 merge commit 与固定 SHA 证据；测试或兼容性失败时留在任务分支继续修复，不修改 personal。后续修复追加提交、不 amend 被检查的合并 SHA。归档和日志在最终任务分支上随工作提交保留，不单独补入 personal。
