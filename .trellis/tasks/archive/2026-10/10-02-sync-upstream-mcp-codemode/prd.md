# Merge upstream MCP and Code mode updates

## 目标

把上游新增的 MCP / Code mode、聊天交互及稳定性和安全修复合入个人 fork，保留现有个人功能，交付可以独立评审和回滚的合并分支。

## 已确认事实

- 用户于 2026-10-02 明确要求「开启新任务、合并上游更新」；最终计划仍需单独确认后进入实施。
- 本地基点 L：`personal@93e63e873481aea761cb2b2072c8a2da1654dc73`；创建任务前工作区干净。
- 固定上游目标 U：`agegr/pi-web@d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`；共同祖先 B：`433d09ea2f2cc77b0ff356e8c57575cd4d30179e`。远端名 `for-sync` 写入 `refs/remotes/upstream/*`。
- B→U 有 59 个提交、157 个变更文件；`git merge-tree` 预判 27 个内容冲突。实际合并冲突与运行回归尚未验证。
- 四个直接 Pi SDK 依赖已经为 `0.99.1`；上游另外新增 Safari/iOS 16.2 编译配置、loader 和 `@types/mdast`。
- 上游 MCP / Code mode 已完成运行时 P0/P1，尚未提供浏览器 MCP 管理面板（ADR 0006）。

## 范围与要求

- R1 — 完整同步固定目标 U，以真实 merge 保留上游提交历史，不挑选部分提交，也不在实施中悄悄追随新上游目标。
- R2 — 保留 fork 的 `ask_user` 共享 React 视图、持久化和重水合、追加系统指令、exact prompt、停滞看门狗、Trellis 子代理快照、附件及可点击文件路径。
- R3 — 保留会话增量缓存、按项目加载和单行刷新、深链/tab/workspace 恢复优先级、字体与全局字号快捷键、minimap 点击预览和尾部跟随语义。
- R4 — 纳入上游 MCP / Code mode 运行时、只读工具限制、工具曝光、弹窗队列、生命周期和 SSE 优化；同时保留 Chat-only 和子代理隔离，以及 SDK admission 与运行完成的区分。
- R5 — 纳入上游文件授权收紧、符号链接及路径越界修复，不以「保留 fork」为由保留安全缺陷，也不删掉合法附件/编程工具/子代理产物的打开能力。
- R6 — 保留 `@xup3ng/pi-web@0.12.0` 包身份和当前 SDK pin，吸收本次上游需要的依赖及编译配置；不得降低类型、lint 或测试门禁来隐藏冲突。
- R7 — 在从 L 派生的独立特性分支和同级 worktree 实施；不推进本地主分支，不污染现有 checkout 的依赖、`.next` 或真实 Pi 数据。记录逐文件冲突决策及自动合并语义复核。
- R8 — 从各自锁文件一致的干净依赖树获取基线与候选结果，完成类型、lint、单测、离线 SDK/MCP 集成和实际浏览器回归；未覆盖项、环境阻塞和实际功能失败分别报告。

## 验收标准

- [x] AC1（R1/R7）：最终分支包含 U 为祖先的 merge commit；实际冲突逐项有解决记录，无未合并路径或遗留冲突标记；`personal` 不被本次实施推进。
- [x] AC2（R2/R3）：既有 fork 专用回归通过；ask 重水合/回答、追加系统指令、watchdog、Trellis 快照、文件打开、按需侧栏、会话恢复、字号/minimap/尾部跟随不被静默删除。
- [x] AC3（R4）：使用隔离 fixture 与真实 SDK 验证 MCP 惰性连接、项目信任、只读阻断、Stop/idle/shutdown、工具 active/exposure、Code mode 展示和扩展 UI 队列；Chat-only/子代理不意外接入内置 MCP；admission 仍按三种 disposition 接收。
- [x] AC4（R5，适用边界见下）：系统消息、非编程工具任意文本及越界路径不能扩大授权；合法 fork 产物仍经所属会话证据与统一路径边界打开；错误/preview-only 不伪造成功写入。
- [x] AC5（R6/R8）：候选的 `tsc --noEmit`、`npm run lint`、`npm test` 全绿，依赖树与锁文件一致；包身份、版本和四个 SDK pin 不退回上游值；新增三语文案一致。
- [x] AC6（R3/R8）：隔离浏览器套件验证桌面/移动布局、ask、session restore、扩展弹窗、Trellis 快照及字号/minimap；必要的新增交互有专项覆盖。浏览器不具备 Safari 16.2 时只报告配置/loader 检查，不声称真机通过。
- [ ] AC7（R7/R8）：验证、残余风险、spec 评审结论和提交信息持久化；最终 archive/journal 随本特性分支提交，不补到 base 分支。

### 提交前验收边界（2026-10-02）

上述完成项对应 `research/main-verification.md` 的最终全量结果，不是旧 targeted passes。
AC4 阻断 direct/新建/resume decorated-call 快照来源洗白，但**已经提升且丢失 provenance 的历史
Agent.writtenFiles 未迁移/回查 child**，仍可能按 U 的 exact Agent path-reporting 政策授权。
不声称追溯清理历史污染，也不禁止 U 有意保留的模型正文/参数。Safari/Windows 真机、实际
用户 MCP/OAuth/付费 provider 和运行中 thinking/fork 浏览器控件未覆盖；Node/fixture 不能替代
这些证据。用户随后已一次性批准五批本地提交；AC1 已通过 `56a45e4` 的双父提交及 U ancestry
证明，见 `research/closeout.md`。AC7 的未勾选状态是此 artifacts 提交时的 bookkeeping 检查点；
其最终完成由同分支后续 archive/journal 提交和最终 Git 检查证明，不另补到 base 分支。

## 不在范围内

- npm 发布、版本号提升、推送远端、开 PR、直接合入 `personal`/`main`，以及清理其他任务的 worktree。
- 实现上游尚未上线的 MCP 设置面板、OAuth 管理或 registry search。
- 升级 Pi 到另一个版本、升级 Trellis、无关依赖升级、重写个人功能架构。
- 使用真实凭证进行付费模型请求，或连接用户实际 MCP 服务作为测试。
