# AskUser host integration 验收汇总（2026-10-06）

## 状态与精确候选

实现、独立审查、干净依赖树门禁、实际系统包正向 smoke 和真实 Chromium 验证完成。用户在查看提交范围后要求“以合理的逻辑组织 commits，不留中间过程”，授权本地逻辑提交；没有 push、开 PR 或部署授权。

最终工作提交 `c275bf2`（实现与对应回归）和规范提交 `2f54c1b` 已落在 `ask-user-host-integration`。提交后源码/测试/规范树与下述已验证快照一致，不保留探索性/WIP/调试修补提交。任务产物、归档和会话日志在同一分支按仓库约定交付；必要失败证据是验收边界记录，不是中间代码版本。

- 最终 validation-only ref：`8a4699c435eddc06ae3b3f23f088d0896d75cddb`。
- tree：`c15f300519f7d6e8f557fa098ec44d25d64cee8e`。
- 本次收尾复核：相对当前 HEAD 的全部 **74 个 no-renames 改动路径**与该快照逐字节一致（含应删除路径不存在）；无任务目录之外未知路径，index 未暂存，`git diff --check` 通过。
- 74 是本次 `git diff --name-only --no-renames HEAD <ref>` 的实测口径；不沿用早期报告的 72 或将历史 102-path manifest 当作同一数字。仅任务验收文档在本次复核后补充，不改已验证产品树。

## 实现结果

系统安装且经 SDK 原配置发现的扩展是唯一 AskUser 工具源。Web 的 inline 扩展只绑定同 loader 的 v1 bridge，不另行安装、pin、复制可执行工具或提供 fallback；系统来源、execute/schema/prompt 保持。必要投影限于 model-only/来源冲突/宿主准入，不增加 active-all 回灌。

Web 的 DTO/校验/状态/答案交付/controller/React view 保留。原 view/controller/keyboard/copy/CSS 迁移前后 byte-identical。专用 General 设置、设置 route/helper、两项三语设置文案及 env 消费已移除；旧配置字段作为未知字段保留，不写真实配置迁移。

SDK 原 activation/selection/reload 是权威：codemode/deferred 原定义即使 `defaultActive:true` 也不默认激活，转为 model-only 时 clone 归一化为 false；显式选择仍有效，hidden 不复活，源定义不 mutate。127 项新增对照是受控 protocol fixture 的真实 SDK 测试，不宣称是实际系统包的 127 项验收。

## 验收映射

| 条件 | 结果与证据 |
| --- | --- |
| AC1 来源/根因 | 已验证。来源研究与 baseline 实际包复现确认 first-wins、缺同 loader host、旧 gate 绕过和 direct exposure；见 `loader-source-and-minimal-plan.md`、`baseline-validation.md` 与 baseline probe 输出。 |
| AC2 唯一系统工具/Web host | 已验证。实际源独立副本经真实 SDK 发现，唯一 installed source、model-only、bridge 登记/posted/terminate，`ui.custom=0`；实际 Chromium 链成功。 |
| AC3 执行/选择/答案边界 | 已验证，分层证据。protocol fixture 覆盖冲突、错误、inactive/hidden/选择/非主会话/nested deny；实际系统源验证 submit/cancel、同会话续跑与三次真实 reload。 |
| AC4 既有回归 | 已验证。最终全量单测与完整既有 Chromium e2e 通过，含 admission、状态恢复、tool exposure、迟到关闭/销毁竞态。 |
| AC5 投影/门禁/披露 | 已验证。`projection-diff.md`、独立审查、最终三件套及浏览器日志；未覆盖平台列于下文。 |
| AC6 无重复核心/依赖与宿主解耦 | 实现与源码/SDK/开发浏览器范围已验证：无固定生产依赖、系统路径 import、fallback 或配置 facade；无包/无效协议和历史 pending 有回归。**production bundle/distribution 与真实 TUI UI/PTY 未执行，整项不标全部验证通过，保留为发行/平台验证风险；实施任务的归档不代表发行验收。** |
| AC7 设置退役 | 已验证。源码/隔离单测及三语 General 浏览器检查；旧 false/env0 不阻止实际工具，旧 GET/PUT API 为404，其他设置保留，无真实配置迁移。 |

## 干净门禁与环境差异

来源为独立普通磁盘 worktree 上的 `npm ci --include=dev`，baseline 与最终候选使用同一依赖树，manifest/lock 未改，四个 direct Pi SDK 包均 1.0.0。Node v24.21.0、npm 11.19.0。

| 门禁 | baseline | 最终候选 |
| --- | --- | --- |
| TypeScript | 0 diagnostics | `--noEmit --incremental false`，0 diagnostics，exit0；包含浏览器生成 `.next/dev/types` |
| ESLint | 704 files，0 errors/0 warnings | 703 files，0 errors/0 warnings，exit0；`npm run lint` exit0 |
| Hermetic npm test | 2758/2758 | **2870/2870**，13 suites，0 fail/skip/cancel/todo，exit0 |

单测净增112：前轮退役/重归属净减15，再增加127项实际 SDK activation/selection/frozen-definition 对照；详见 `final-candidate-count-diff.json`。lint 文件计数差异由文件集合变化解释，不是规则或依赖树变化。

原 strict-offline baseline 的4项 mock-only plugin-update 测试失败完整保留，不能写成首次全绿。最终 hermetic harness 仅对 opt-in、固定文件名及完整 hash 匹配的未改 mock 测试 worker 恢复其环境假设；其他 worker 仍 offline，外网由 network namespace 物理阻断。实际包/runtime/browser 没有该 preload。详细出处：`baseline-hermetic-validation.md`、`final-candidate-validation.md`。

`npm ci` 当次报告17项依赖漏洞（6 low/4 moderate/7 high），未 audit-fix，未扩大本任务依赖变更。

## 实际系统源与浏览器证据

实际只读扩展 HEAD：`59e0256c869e9ce04abffc1204537c7bf1501450`。11个必要源码文件独立复制、hash 和 SDK host identity 记录在 `final-candidate-installed-probe.log`；源版本只作证据，不作为产品 pin。没有修改外部仓库或读取真实凭证。

- SDK/Web wrapper smoke：5 opened/5 closed、9次 faux provider 请求、3次真实 reload、0 TUI custom。发问每回合仅1次 provider 请求；submit/cancel 通过同一 session custom follow-up 续跑。
- `browser-protocol-retry-run.log`：protocol peer 真实 Chromium host 链通过，不冒充实际系统包。
- `browser-installed-run.log`：显式实际系统源副本的真实 Chromium host 链通过，exit0；实际 Web API/SDK/faux provider，不 stub ask 提交命令。覆盖提交/取消、刷新/切会话、wrapper 重建原 askId、第二设备轮询关闭及 General 设置退役。
- `browser-full-retry-run.log`：未筛选 `npm run test:e2e`（run + subagents）通过，包含 desktop/mobile/touch 既有回归，exit0。

首次 host browser 的错误是测试 selector 不匹配，失败截图保留，修正测试实际 DOM 定位后通过。首次全套 e2e 的 `/api/app-update` 502 来自隔离外网下任务外版本查询；重跑仅设置既有 `PI_WEB_SKIP_VERSION_CHECK=1`，未修改业务/套件断言或开放外网。失败日志/截图/trace 保留，不伪称首次通过。

## 可靠性与未覆盖

Web 仍为内存权威、best-effort 磁盘镜像、fire-and-forget 答案交付；没有 strict-open、durable outbox、自动重试或 exactly-once 新承诺。没有迁移 TUI branch drafts/repair/native pending，也不宣称跨 host 完全等价。

未运行：production build/bundle/distribution、真实 TUI UI/PTY、Safari/iOS、Windows、live 部署/重启及真实模型。客户端源码边界与开发浏览器通过不等于生产发行物验证。主 checkout 旧 `.next` 的4条 stale route TS2307 不用于宣称类型门禁通过；最终干净候选完整 tsc 已通过，不恢复旧 route 或弱化 tsconfig。

## 清理与提交边界

本任务测试服务/浏览器/runtime 进程已停止；失败 scratch 在保全证据与核验 ownership 后逐路径清理；唯一 clean validation worktree 已通过 `git worktree remove` 删除。正式 research 约9.7MiB，包含失败 trace；详情见 `final-cleanup.log`、`final-process-ownership.log`。

提交前源码/测试/规范/任务 Markdown 的 whitespace 检查通过。六份原始命令 `.log` 合计保留145条捕获输出的行尾空白（主要是既有失败测试的缩进空行和 npm banner），因此全文件 `git diff --check` 会报告这些日志；只排除原始 `.log` 后检查为0。不修改原始失败/成功输出以制造“全文件无诊断”，这不是产品代码或门禁回归。

预先存在的部署服务未操作，源码修复不会自动进入自包含 dist。任务产物、归档及 journal 随最终工作留在特性分支，不在 personal/main 追加独立收尾提交。未覆盖项保留，不把本地交付扩大为发行验证；推送/PR/部署仍需另行授权。
