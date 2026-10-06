# 系统 AskUser 接入与并立 Web host 验收计划（2026-10-06 已获批准）

## 阶段闸门

- [x] 用户授权创建调查与修复任务；任务状态 planning。
- [x] 确认实际安装来源、first-wins、missing bridge、gate/model-only 与部署边界。
- [x] 用户选择外部唯一实现、去内置；原内建 fallback 提案已撤销。
- [x] 用户澄清使用系统安装版本、Web/TUI 投影并立；固定 tarball 与隐藏系统包的上一提案全部撤回。
- [x] 用户明确删除 Web AskUser 专用开关；已盘点 General UI、API、helper、env、三语设置文案与旧测试，保留 SDK 原选择及执行边界。
- [x] PRD 收敛并写 design/implement 与真实 spec/research manifests。
- [x] 向用户展示最终范围与风险并获得后续明确同意；用户最终回复“开始吧”，批准此版本规划，不包括部署/重启。
- [x] 已运行 `task.py start`，状态为 in_progress；建立任务分支 `ask-user-host-integration`，不在 personal 直接提交实现。

## 顺序与改动边界

1. **隔离基线与系统包 discovery。** 干净 npm ci --include=dev 树验证原 ref 的 first-wins/got0/gate/direct。隔离 HOME/agent/cwd，从实际已安装扩展创建独立包快照，在原 SDK packages 路径执行 discovery；记录源 revision 与 SDK identity 只是证据，不添加产品 pin。永久测试可有小型 protocol fixture，但不得将 fixture 冒充真实外部包验收。不改真实配置/外部仓库，不读取凭证或请求模型。
2. **清晰的 Web protocol owner。** 盘点 portable 消费者，区分外部工具核心与 Web 的 DTO/bridge 解码/浏览器校验/答案格式/UI。移除可注册工具、schema/prompt/execute、bridge caller/resolver、本地包声明与不用 alias；Web host 必需校验集中重归属，不盲删也不再复制完整工具。UI/controller 只移动/更新内部 imports，不改变行为；构建不静态 import 系统路径，不新增 dependency/transpile 设置。
3. **同 loader bridge 与执行边界。** 正常主会话的 Web inline 只同步 register async open，不注册工具，不读取 Web enabled/env。检查 v1、loader 会话身份、alive wrapper、有界输入；对唯一 discovered 工具投影 model-only，child/Chat-only deny，多来源 fail closed。保留 SDK defaultActive/active/hidden 及原资源选择；compose overrides 只改受影响 tools Map，不回灌工具/删无关资源，不增加 facade/额外 entry。
3a. **删除 Web 专用开关。** 移除 General AskUser section、状态/fetch/toggle/专用 reload handler、API route、ask-user-settings helper/旧设置测试、三语 settings.askUserTitle/Description。按真实引用清理局部参数/样式，不删共享 agents.reload 文案或其他 settings/reload。旧 askUser 字段/env 停止消费、不做真实配置迁移；增加隔离退役回归，证明不会暗中禁用已激活的系统工具。
4. **系统来源与 reload。** sourceInfo 必须保持用户安装来源；无安装时无工具且 Web 可启动，已有 pending 保留。原包版本变化/不同目录安装/reload 后重新 discovery 与协议准入；未知 version 拒绝，兼容 v1 不凭 SHA 拒绝。一个外部工具 + 一个 Web host，不假称加载后 policy 撤销任意 factory 副作用。
5. **集成回归。** 实际系统包 execute/terminate、缺包/坏 entry 无 fallback、多工具来源/混合扩展、SDK 原资源/active loadout 的关闭与 reload、missing/closing/mismatched wrapper、bad version/ack、single/multiple/custom/supplement/skipped、Code mode only direct/nested deny、prompt admission、supersede、同会话 submit/cancel、hydrate askId、迟到 close/destroy。加入旧 askUser:false/env 0 不再生效、SDK inactive/hidden 不复活、其它设置未知字段保留与三语一致性断言。Web 不打开 TUI，原 TUI host 不被 Web policy/bridge 干扰；未实际运行 TUI UI 则标未覆盖。
6. **真实浏览器。** 在隔离服务/faux provider 下：系统包 discovery→ask→卡片→submit/cancel→同会话 continuation；刷新/切会话/重建、跨设备关闭、key remount。General 无 AskUser 开关/专用 reload、无旧 API fetch，其它设置正常；SDK 资源变化后的 reload 沿原流程。现有 e2e/ask-user.mjs 的 stub 只证明 view，不替代 host 全链路或设置页面浏览器验收。
7. **构建/协议边界。** 验证没有系统扩展安装时 Web 的类型/模块加载仍成立，客户端不含外部工具/TUI/SDK；隔离宿主发现来自 agent 配置而非 checkout 或硬编码路径。不同安装路径、环境 agentDir 与 v1 兼容/拒绝例须覆盖。不开发期 next build，不把源码检查当 production 发布产物执行；未跑分发/Safari/Windows检查如实披露。
8. **独立检查。** dispatch trellis-check 复核 discovery→loader→tool policy→bridge→store→SSE→hook→UI→answers；确认无另一份工具/固定依赖/系统包遮蔽/旧 Web 开关或隐藏 env gate，原 SDK selection/其他 settings/reload/host 校验不退化，scope 扩大则停。
9. **规范与收尾。** 更新 ask-user spec/topic notes/安装前提与协议兼容说明，记录外部版本证据、投影表和未覆盖项。三件套、真实系统包集成与浏览器门禁后提交预期文件；archive/journal 在任务特性分支随 PR 合并，不自动部署/publish。

## 验证命令与证据

统一依赖树来源：干净独立工作区 `npm ci --include=dev`，记录 baseline ref `128fc3c7` 与实际候选树。运行并保存实测计数/退出码：

```sh
node_modules/.bin/tsc --noEmit
npm run lint
npm test
PI_OFFLINE=1 JITI_FS_CACHE=false node --test lib/ask-user/*.test.mjs
E2E_SERVER_MODE=dev npm run test:e2e
```

隔离 HOME/PI_CODING_AGENT_DIR 必须在 import 之前设定；离线 runtime tests 不读取真实 agent dir。若现有全量套件部分 fixture 依赖不同隔离方法，沿用其自隔离契约，不把整个真实 HOME 传给新测试。

使用 `~/.pi/agent/bin/pi-tmp-run --keep-on-failure <label> -- <command>` 管理有限临时产物；首次验证实际 TMPDIR。大型/继续开发源码与独立 git worktree 放主磁盘普通目录，不放自动清理 cache；不要复制 node_modules/.git/.codegraph，无 next build。

浏览器产物显式指向 `$PI_TASK_TMPDIR/results`；默认无录像，trace 只失败/重试，正式证据转任务 research。若复用 e2e/run 的 root test-results，结束后将本任务证据归档并清理本任务产物。先检查 30141，不能在同 checkout 开第二 dev graph；隔离 checkout 的测试服务使用独立 .next、agent dir 与端口，记录 PID/log，结束仅停止自己启动的进程。

清理本任务目录/进程与 worktree 前检查未提交改动；git worktree remove 正式移除，不 rm 唯一数据。当前已有 dist PID 950/4471 不属于本任务，不操作。未运行 Safari/Windows 或 live 更新须如实说明。

## 非目标与风险门禁

- 不修改外部 pi-extensions 或真实 settings，不重新实现 Web UI、不加入 TUI branch drafts/outbox/repair；UI 移动不是新功能设计。
- 不添加固定 AskUser 生产 dependency、不自动安装/遮蔽系统包、不提供内建 fallback、不接管外部版本管理或外部发布。
- 不写真实配置清除旧字段，不保留兼容 Web 开关，不因删除专用开关取消 model-only/Chat-only/子代理边界或强制激活 SDK inactive/hidden 工具。
- 不将 best-effort mirror 改成 strict-open，也不承诺答案 exactly-once。
- 如果 source policy 无法在不更改 SDK 或产品准入约定下保证唯一 owner/model-only，停止并向用户报告；不能临时退回“只加 bridge”。
- 当前源码修复不自动进入 dist；未经单独授权不重启、部署、发版。

## 执行与交付状态（2026-10-06）

- [x] 完成系统唯一工具源、bridge-only Web host、工具级 model-only/来源冲突投影及非主会话边界。
- [x] 完成重复工具/portable 包与专用 Web 设置链退役；表单/controller 仅迁移路径，行为模块逐字节保持。
- [x] 完成独立 trellis-check 与规范/主题说明同步，无待修产品代码缺陷。
- [x] 在同一 clean npm-ci 依赖树完成 baseline 与最终候选门禁：类型 0 diagnostics、lint 703 files/0 errors/0 warnings、hermetic 单测 2870/2870。
- [x] 完成实际系统包独立副本的 SDK/Web wrapper smoke，以及 protocol peer 与实际系统源分开运行的真实 Chromium host 链；完整既有 e2e 重跑通过。
- [x] 正式保存失败/成功证据和环境差异；停止自有服务/浏览器进程，清理自有 scratch，并正式移除验证 worktree。
- [x] 提交前复核全部 74 个相对 HEAD 的候选改动路径与已验证快照逐字节一致；无任务之外未知改动、无已暂存文件，`git diff --check` 通过。
- [x] 用户授权按合理逻辑组织最终提交、不保留中间过程；工作提交 `c275bf2`，规范提交 `2f54c1b`，提交后源码与最终候选一致。
- 任务产物、archive、journal 按仓库约定在同一特性分支依次提交，不夹杂探索性/WIP/调试修补提交。归档/会话日志的实际结果由专用提交记录；不自动 push、PR 或部署。

精确候选 ref/tree、计数差异、实际包来源、浏览器证据与未覆盖项见 `research/acceptance-results.md`。production 分发、真实 TUI UI/PTY、Safari/iOS、Windows 未验证；主开发 checkout 的 stale `.next` 类型不用于替代最终干净树的类型门禁。
