# 交付边界与验证复用（2026-10-06）

用户原话：“已确认，归档任务提 1 个 PR 自行合并并收尾”。这是本任务的提交、推送、
归档、PR、合并与Git清理授权，不是发布/npm版本或正式服务部署授权。

## 已核验的范围与目标

- 特性分支 `feat/notification-center-sync`，已确认base `personal@e0ad630`。
- PR目标为本fork `github.com/xupeng/agegr-pi-web:personal`。Task已批准该base；此前PR32
  同样落在personal。`for-sync`（写入upstream tracking namespace）仅供外部agegr同步，
  不把fork全部既有定制或本任务改为外部上游PR。GitHub身份与仓库URL已核验。
- 原base到HEAD无隐藏/无关既有提交。53项功能/测试文件及5项规范文件分别提交，
  规划/验收/原始隔离证据、归档及journal属于同一个PR。
- 主仓与另一个worktree的 `.trellis/tasks/10-06-subagent-model-selection/` 均是另一个
  任务的未跟踪工作；不stage/stash/discard或替它提交。Git closeout只清本任务分支。

## 复用而不重复运行的验证

- 完整门禁：`validation-logs/tablet-check-01a1116a-final/`，tsc/lint exit0，733个lint
  target零诊断，3005 tests / 13 suites全过，定向39/39。
- 最后一次产品修改后Chromium布局10场景/39测量通过：
  `validation-logs/layout-2026-10-06T13-41-40-298Z/`。只证明全API本地fixture的前端布局。
- 提交前再核对历史manifest的52项源码（以最新tablet manifest覆盖其被替换项）以及
  最新7项源码/锁文件：无未知源码变化。后续仅doc/归档/journal变化不使该product证据失效。
- Task JSONL入口14/15项校验通过。文本及唯一诊断trace扫描未发现长API token、GitHub
  token或Bearer凭据指示；原始隔离数据不含live agent配置/凭据。没有symlink/ignored
  artifact，不用force-add或全仓stage。
- 远程CI按PR触发；创建后等待实际状态，检查失败不绕过。使用merge commit保留工作、
  archive、journal的可达性，之后只fast-forward personal并按祖先关系安全删本任务分支。

## 提交顺序

1. `1c0fde4` — 功能代码、测试和两个独立浏览器runner。
2. `c914947` — 执行契约、对话列锚定、文档入口。
3. task规划/验收/研究/验证产物。
4. task.py归档产物（必要的context入口同步随该归档提交）。
5. add_session.py生成journal；仅手动stage本次journal/index，避免archive后fallback
   current-task把另一个正在进行的任务纳入auto-commit。
6. 显式push本分支，创建唯一PR、ready/merge，再核验MERGED和实际base/ref并Git收尾。

本文件是PR创建前的执行记录，不声称尚未发生的push/merge已经成功。实际PR URL、head/
merge SHA与清理结果从GitHub/Git实测并在会话交付摘要报告。

## 服务与残余边界

用户要求保留使用的 `192.168.11.233:8505` 开发服务继续运行（CLI1118376/Next1118396），
不因Git收尾自动停止；正式1005816不动。准确运行记录/日志在
`~/.local/state/pi-web/agegr-dev-8505-20261006-01a11076.{json,log}`，运行TMPDIR在
`~/.cache/pi-web/agegr-dev-8505-20261006-01a11076/`，用户停用后再精确清理。

不发布、不升级SDK/pins、不部署正式服务。Safari/iOS/Windows/部分focus-hidden矩阵及特殊
SDK扩展收尾归属限制仍按验证报告披露；用户确认UI不使未执行平台自动变成已验。
