# 同步预研（2026-10-03）

## 实测 Git 证据

- 初始工作树：personal，与 origin/personal 一致；HEAD `8d376f3b1b98adf91f2ae651a7188745b1f563fd`。
- `git ls-remote for-sync HEAD refs/heads/main`：两项均为 `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`。
- remote.for-sync.fetch 是 `+refs/heads/*:refs/remotes/upstream/*`，普通 fetch 后旧 for-sync/main 仍停在 `d733d43`，曾产生落后 0 的误导结果。已显式 `git fetch for-sync main:refs/remotes/for-sync/main` 验证与 live SHA 一致。以后必须同时检查 refspec 和真实远端 SHA。
- 共同祖先 `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`；personal...TARGET 左右独有提交 295 / 47。
- 上游差异：155 文件、37569 insertions、1652 deletions；`--diff-filter=D` 无输出。
- 上游依赖/配置漂移：package.json 和 package-lock.json；四个 Pi direct pins 从 0.99.1 → 1.0.0，发布版本 0.9.3 → 0.10.0。fork 包版本须保留 0.12.0。next.config.ts、tsconfig.json、eslint.config.mjs、.github 本轮无上游差异。

## 隔离合并预演

临时磁盘 worktree `/home/xupeng/dev/personal/forked/agegr-pi-web-sync-plan.lOdMrR` 从 BASE 创建，执行 `git merge --no-commit --no-ff TARGET`，退出码 1，14 个 UU：

1. AGENTS.md
2. app/settings.css
3. components/ChatInput.tsx
4. components/ChatWindow.tsx
5. components/MessageView.tsx
6. components/SettingsPanel.test.mjs
7. components/SettingsPanel.tsx
8. hooks/useAgentSession.ts
9. lib/i18n/messages/en.ts
10. lib/i18n/messages/zh-CN.ts
11. lib/i18n/messages/zh-TW.ts
12. lib/settings-navigation.ts
13. package-lock.json
14. package.json

预演后 merge --abort 并移除该临时 worktree；主 checkout 只有新建任务目录，产品代码未改。预演结果不是实施或测试通过证据。

## 高风险语义交集

主代理核对固定两侧 upstream diff：builtin-extensions 新增 fresh trust、settings switch 查询、startupWaitMs:0；rpc-manager 新增 slash 分类准备、MCP host dispose、模型声明描述和 declarationHidden；pi-sdk-internals 新增 providerToken；tool-presets 增加 declarationHidden。自动合并仍须核对 fork admission、ask、watchdog 和资源工厂。

只读子代理会话 `01a0ff48-f490-70fc-bdb4-49a61ce74e08` 补充 personal owner/测试建议，但工具没有 bash，不能运行 codegraph/git diff；其报告不作为两侧 diff 或 SDK 1.0.0 实证。

- lib/ask-user/portable/package.json:13 两个 SDK peers 固定 0.99.1，主代理 read 已确认；portable/discovery.test.mjs 的版本断言同步处理。
- lib/rpc-manager.ts:976–1089 admission 与 closeAsk；:2629–2670 资源工厂，lib/subagent-runtime.ts:260–337 子代理分支。
- lib/agent-event-wire.ts:80–122 Trellis structured final 窄例外，hooks/useAgentSession.ts:1998–2021 对应消费；watchdog 仍监听 inner 原始事件。
- lib/rpc-manager.ts:271–303,789–805 与 hooks/useAgentSession.ts:2744–2794 configured/pin/carry；ask_user 的 model-only 和导航 carry 不能丢。
- components/AppShell.tsx:154–180,2168,2422 子代理记录 ownership；:1117–1140 文件 options handler。
- lib/exact-system-prompt.ts:23、lib/chat-only.ts:5–18 与 rpc-manager 子代理 snapshot/reopen 的 exact prompt 边界。

上述行号来自 BASE，只用于定位，合并后需要重新核实。真实 1.0.0 SDK 构造、内部模块/transport singleton、terminate/admission 兼容性留给实施后的隔离验证。
