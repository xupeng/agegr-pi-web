# PR33 CI复核与归档返工（2026-10-06）

- 唯一PR33，checked head `fc8267471cc913ee8c5664efd58b154f6082ff83`，base personal。
- GitHub CI run `37476721010`：标准 Node22.19.0 + `npm ci`。
- lint和TypeScript通过；production build与完整browser e2e通过（e2e job7m）。
- `npm test`失败：两份新增文件在module初始化assert本机wrapper的 `PI_TASK_TMPDIR`。
  失败位于 `lib/agent-run-observer.integration.test.mjs` 和
  `lib/rpc-manager.notifications.test.mjs`；不是remote lint/type/e2e失败。
- 原始failed job日志已保留在 `validation-logs/pr-33-ci-37476721010-checks.log`。

返工仅修标准runner的临时目录可移植性：本机仍优先尊重PI_TASK_TMPDIR/TMPDIR，缺少本机
wrapper时用平台临时API创建独占small offline fixture，不依赖本机路径、个人二进制或隐式
global env。保持SDK import之前的独立HOME/agentDir，offline/MCP禁用只作用于这两份测试进程，
保持清理责任，不将源码、node_modules、Git worktree或大型浏览器产物放进/tmp。

同一个PR继续，暂不merge；归档task重新标记in_progress，修复/独立复核/新证据后恢复completed。
已提交归档不会被绕过或在personal事后补写。另一个任务与用户8505/正式服务不触碰。

## 修复及独立复核完成

- test-only工作提交 `780c693`：两份文件用 `node:os.tmpdir()` 做可选wrapper之外的fallback。
  未改产品、CI/npm script、SDK、交互或浏览器；原browser产品证据不受test setup修改影响。
- 实施记录 `pr-ci-implementation.md`；独立复核 `pr-ci-review.md`，最终证据
  `validation-logs/pr-33-ci-fix-check/safe-final/`。
- 三种临时根模式各40/40，含空格的TMPDIR定向40/40；无PI_TASK_TMPDIR的全量3005/3005，
  733文件lint零诊断、tsc exit0。916项源hash门禁前后稳定。
- 独立复核保留harness编译cache误判与既有MCP测试未引用空格路径的失败尝试；仅修验证
  harness/使用无空格的全量临时根，不扩大产品修改或隐瞒失败。独占fixture全部精确清理。
- 归档元数据恢复completed并写入真实PR33 URL；追加规范和会话日志同分支推送，等待
  新head的标准Node22.19.0远程CI结果。这里不提前声明尚未发生的新CI/merge成功。
