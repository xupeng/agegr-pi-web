# 技术设计：上游同步边界

## 固定输入与交付

- L = `93e63e873481aea761cb2b2072c8a2da1654dc73`，U = `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`，B = `433d09ea2f2cc77b0ff356e8c57575cd4d30179e`。
- 分支拟为 `merge/upstream-mcp-codemode-20261002`，PR base 为 `personal`；工作目录拟为仓库同级的 `agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`。若同名已存在，先核实所有权，不覆盖。
- 一个集成交付任务，不拆成相互无法独立验收的代码合并子任务。研究和最终质量检查交给独立子代理；实施按底层→API/hook→UI 顺序。
- 使用 `git merge --no-ff --no-commit U`，逐 hunk 解决，不使用 `-X ours/theirs` 或整文件选边。自动合并文件也按语义审查。
- 当前规划仅使用 `merge-tree`，未执行产品文件合并。批准后先在隔离 worktree 获取实际冲突清单。

## 行为差距与文件边界

当前 fork 尚未接入 SDK 的 MCP/Code mode 内置扩展和本轮上游交互修复。真实落点是资源加载、RPC wrapper、工具曝光、事件投影、hook 状态和组件，不是额外加一层通用拦截器。

预期修改集合为 B→U 的 157 个上游文件及解决冲突所必需的 fork 测试、窄适配、spec 和任务产物。不会对 B→L 的个人新增文件做批量替换；新的兼容修复须说明对应哪条上游变化。

## 运行时组合

```text
主会话 resource loader
  ├─ fork project bash / subagent / ask_user
  ├─ upstream codemode / tool-search / mcp factories
  └─ trust + configured extension overrides
        ↓
wrapper admission → MCP prepare/Stop → SDK prompt acceptance
        ↓                           ↓
pending ask 失效（仅接收后）     promise / SDK events → 完成
        ↓
SSE projection → useAgentSession → ChatWindow / MessageView
```

- 保留 `startRpcSession` 的主会话 / Chat-only / subagent resource snapshot 分支，不能用上游 factory 数组替换 fork 的整个 resource-loader 配置。
- exact prompt 继续经 `before_agent_start` 提交给 provider，不能直接改只读 `agent.state.systemPrompt`。新建子代理和 RPC 重开子代理的策略须相同。
- MCP host 在普通会话发送前惰性准备；项目文件只在项目信任时读取，配置变动下一条消息生效，Stop 可中止等待。
- 使用上游最终版 `resolveActiveToolNames`，保持 registered / active / exposure 的区别；不恢复把所有扩展工具强制开启的旧 helper。
- admission 仅串行接收，三种 disposition 都为成功接收。MCP 等待/失败不能导致 POST 提前成功或提前清理旧 ask。
- 上游控制工具 `model-only` 与 fork `ask_user` 的终止语义一起审计。`ask_user` 必须只能由模型直接调用：嵌套脚本不得打开持久问题却吞掉结束回合语义；为 portable 工具增加明确曝光契约和回归。

## 弹窗、ask 与 watchdog

- 吸收上游按 id 的普通 dialog/custom panel 队列和重连有效 id 对账，保留 fork 的折叠状态和清理逻辑；不另行发明跨两类队列的统一调度器。
- `pendingAsk` 不并入阻塞式 UI 队列；仍是每会话一个持久化 open ask，由共享 React renderer 展示并通过 follow-up 回答。
- 保留 askId 重水合、旧响应防超车、跨设备状态轮询及提交后 fire-and-forget。
- watchdog 是 SDK 事件沉默监控，不是 SSE 输出频率监控；SSE 合并/丢弃嵌套更新不能切断 inner subscription 的事件观察。
- 保留 `agent_settled` disarm、工具级宽限、Stop 共用 abort、持久化本地化原因；整合 closing/shutdown deadline 和 registry identity，旧 wrapper 不得销毁新 wrapper 的状态。

## 文件证据与授权

```text
session entries / coding result / subagent provenance
  → 唯一 evidence owner 与路径边界
  → API 读取授权 / written-file options
  → MarkdownBody / MessageView / ChatWindow / AppShell
```

- 上游 `session-file-references-core.ts` 收紧 system 和非编程结果的文本来源；保留其最终允许的 user/assistant/tool-call arguments、明确 fullOutputPath 和编程工具嵌套调用来源，不擅自升级成“所有自然语言路径一律拒绝”。
- fork 确认写入的判定继续优先 result summaries/appliedFiles，preview 只富化，不确立成功；卡片存在不等于授权。
- 保留附件允许根、UNC 编码、`sourceSessionId` 和 `OpenWrittenFileHandler` options 的 `modeHint/page`。新增授权规则以统一路径边界为落点，不复制检查器。
- 如果上游新调用形态影响现有文件打开，则做必要的证据适配；不把任意嵌套脚本产物 UI 扩展作为独立新功能。本次没有依据就不猜截断调用的路径。
- Git ignore 可见性仅负责展示，不能被用作读取权限；Allow browsing 是用户显式扩大链接目标根，目标变化和 `..` 都须拒绝。

## 自动合并复核

- `lib/session-reader.ts`：保留磁盘 mtime 增量缓存、single-flight/generation、`allowStale`、运行快照与分页。
- `components/AppShell.tsx` / sidebar：首屏项目摘要、单会话更新、请求序号/row override、URL > tab > workspace、子代理 family 聚合。
- `lib/subagent-runtime.ts` / `lib/subagent-extension.ts`：SDK snapshot、工具隔离、exact prompt、resume 通知的新 run 标记与 suppression。
- `app/globals.css` / viewport：采用上游键盘稳定检测与按 scale 的几何修复，保留不抢上滚历史位置的语义，不挂重复监听链。
- 新 Code mode/MCP 对话排版也遵守 `--chat-font-size-offset`；minimap 点击预览不被过程折叠或字体变化破坏。

## 依赖、编译与隔离

- 保留 fork 包名、版本、发布元数据、e2e 脚本。四个 SDK pin 已等于上游，不再重复升级。
- 合入 browserslist、Turbopack/webpack email loader 和 Mermaid transpilation，保留 fork 既有 next 配置。
- npm lockfile 如自动合并不一致，使用 npm lockfile-only 更新并审查，仅限 manifest 变化所需；安装与验证用 `npm ci`。
- 基线、候选安装在同级磁盘 worktree，不使用原 checkout 的 node_modules，不在其运行 `next build`。
- e2e 使用 runner 自建的 `PI_CODING_AGENT_DIR` 和临时端口；真实 HOME/Pi 数据不作 fixture。MCP fixture 不读用户配置，模型请求使用 faux provider。

## 回滚与剩余风险

- 未提交 merge 失败可在任务自己的干净 worktree `git merge --abort`；不对原 checkout 做 reset/clean。
- 已验证的 merge commit 不 amend；独立检查修复用追加提交并复验，保证报告引用有效。
- 不能证明真实 Safari 16.2、Windows 或付费 provider 的运行表现；这些限制单列，不能用 Chromium/源码断言代替。
- 归档只在最终版确认后执行，archive/journal 必须随特性分支一起交付。无自动 push/PR/发布。
