# 执行计划

## 0. 计划门禁

- [x] 固定 L/U/B，确认任务创建许可。
- [x] 只读预判 27 个冲突，检查删除、依赖与编译配置漂移。
- [x] PRD、设计、研究和真实 implement/check manifests 已准备。
- [x] 用户于本轮（2026-10-02）明确批准最终规划并要求直接实施。
- [x] 主会话已启动根任务（in_progress）并在独占候选 worktree 执行真实 merge；本子代理不运行 workflow。

## 1. 隔离与基线

- [x] 再次检查主 checkout 状态、冻结 refs 和其他 worktree；不覆盖并发或用户修改。
- [x] 从 L 创建 `merge/upstream-mcp-codemode-20261002` 及同级 worktree，将本任务规划产物纳入该任务分支，保留会话路由。
- [x] 在与 L 锁文件一致的独立 baseline worktree 执行 `npm ci --include=dev`，跑 tsc/lint/unit，记录依赖版本、命令、退出码、计数。
- [x] 先读取受影响的 frontend 细则和 Pi 本地 SDK 文档，跟进相关 `.md` 链接；研究报告不是文档替代品。
- [x] 在候选 worktree 运行 `git merge --no-ff --no-commit d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`，记录实际冲突；仅允许该 worktree 留冲突。

## 2. 实施顺序

- [x] 底层：`pi-types`、RPC/tool exposure、MCP host、ask/model-only、admission、shutdown/watchdog、event wire/stream；保留两侧测试。
- [x] 文件：file-index/files/path-security/reference evidence，吸收安全修复并保留已确认产物、附件与 source-session 打开链。
- [x] API/状态：session reader/cache、子代理资源构造和 resume 通知、ask 持久化及状态回退。
- [x] Hook：UI FIFO、重连对账、pending ask/旧响应门禁、session reconciliation、viewport 和发送键。
- [x] UI：ChatInput/ChatWindow/MessageView/MarkdownBody/sidebar/settings，整合 Code mode、运行中 fork/thinking、历史编辑与个人组件。
- [x] 三语文案、AGENTS/README、package/lock、next config；保持 fork 身份与发布资产。
- [x] 每个实际冲突和重要自动合并点写入 `research/conflict-decisions.md`；语义相反的测试如需更改期望，解释行为和安全依据，不能只删除失败断言。
- [x] 检查 no-unmerged、冲突标记、意外删除、重复 parser/helper；所有改动以对应上游修复或必要兼容为界。

## 3. 验证命令与用例

候选依赖树：`npm ci`；必要 lockfile 修复须另记录原因和差异。

```bash
node_modules/.bin/tsc --noEmit
npm run lint
npm test
PLAYWRIGHT_EXECUTABLE_PATH=<verified-installed-chromium> E2E_SERVER_MODE=dev npm run test:e2e
```

浏览器前检查候选 `.next/dev/lock`，不在同一 checkout 启动第二个 dev；现有主服务不证明候选版本。e2e runner 自建隔离数据和可用端口。`PLAYWRIGHT_EXECUTABLE_PATH` 要核实文件存在和版本，不能凭历史路径猜。

重点测试集合（以真实文件存在性为准，新增回归落在 `npm test` 的五个 glob 目录内）：

| 域 | 套件 / 行为 |
| --- | --- |
| MCP / Code mode | 上游新增 `builtin-extensions`、`pi-sdk-internals`、`mcp-host`、`mcp-transport`、`mcp-read-only-policy`、`codemode-settings/view`、`rpc-manager-tool-exposure` 单测及 `.integration.test.mjs`；惰性连接、trust、Stop、idle、关闭期限、环境清除、只读 nested 阻断 |
| fork 运行时 | `rpc-manager*.test.mjs`、`exact-system-prompt`、`chat-only`、`session-tool-selection`、`subagent-runtime`；real SDK/faux provider admission 和 exact prompt；ask 嵌套调用拒绝、直接调用可终止 |
| UI / SSE / ask | `agent-event-wire/stream`、`extension-ui-queue`、`hooks/useAgentSession*`、ask portable/store/persist/bridge；重连不重复、关闭按 id、Stop unwind、pending ask 不入阻塞队列 |
| 文件安全 | `session-file-references`、`path-security`、`file-access`、linked-directory/API route tests、`written-file-sources*`、`turn-written-files`；system/非编程结果路径拒绝、合法 sourceSession 文件可开、preview-only/失败不作成功 |
| 会话列表 | `session-list-cache`、`session-reader*`、projects/runtime routes、SessionSidebar；不退回 SDK 全量热扫描、force 单飞、单行 overrides、family/completion suppression |
| 浏览器 | runner 既有 ask/session-restore/extension-dialog/chat-appearance/status-tail/Trellis 套件；新增 Code mode/MCP 卡片和历史编辑/FIFO 等受影响交互的隔离 fixture |
| 排版与输入 | viewport/MobilePwaLayout、coarse touch/IME/send key、ChatAppearance、字号快捷键、minimap 点击、detached tail；三语 registry、旧 Safari regex loader/编译配置测试 |

- [x] 全量三件套与 baseline 比较，所有退出码和数字写入 `research/verification-report.md`。
- [x] 分开报告纯数据、真实 SDK、真实浏览器和真实 provider 的证据；本次默认不调用真实 provider。
- [x] 真机 Safari/Windows 等不可用时标明未覆盖；环境问题与功能失败区分。核心回归失败不能当环境问题略过。

## 4. 独立检查与提交

- [x] 按 `.agents/skills/trellis-check/SKILL.md` 交独立检查子代理，复核冲突并集、自动合并和跨层安全；主会话验证 findings。
- [x] 修复发现并复验，不 amend 已被报告引用的提交。
- [x] 使用 `git merge-base --is-ancestor U HEAD` 证明历史整合；按 merge commit 的第一父提交审查个人文件保留、配置漂移和规模。
- [x] 按路径显式 stage；不 `git add .` / `-A`；保留英文 commit 文案。
- [x] spec 评审：更新 upstream-sync 和必要运行时/安全契约，不改历史归档证据。
- [ ] 任务工作最终版：工作提交 → spec（如有）→ planning/acceptance artifacts → `task.py archive` → `add_session.py`；全部落特性分支。
- [ ] 汇报分支/worktree/提交、验收状态、风险；停在本地，不推送、不开 PR、不发布、不直接合入 personal。

## 实施候选交付（子代理）

27 个实际冲突已解决并显式 stage；MERGE_HEAD 保留，HEAD 未推进。最终候选：tsc 0、lint 627 files/0/0、隔离 units 2105/2105、兼容 focused 92/92。完整证据见 `research/implementation-report.md` 与 `research/conflict-decisions.md`。baseline、真实浏览器、独立检查、merge commit/祖先证明、归档由主会话继续；本子代理未执行这些操作。

## 主会话最终候选验证（提交前）

原始交付后的检查与修复全部保留时间线：主会话最终 tsc 0、units 2123/2123、source lint
629 files/0/0、未过滤 `npm run test:e2e` exit 0（桌面/移动/coarse touch/Trellis）。完整证据、
默认 lint 临时诊断警告归因及残余风险见 `research/main-verification.md`；最终增量只读复核见
`final-incremental-review.md` 与 `final-fixture-review.md`。等待一次性提交批准，任务仍 in_progress；
merge 祖先证明、planning artifacts、archive/journal 和最终本地交付必须在特性分支完成。
