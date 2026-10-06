# PR33 CI test setup 独立复核（2026-10-06）

## 结论与范围

**本轮窄修复通过独立复核，无范围内未解决问题。** 两份测试已由实施代理修改，检查代理未再改测试或产品代码：

- `lib/agent-run-observer.integration.test.mjs`
- `lib/rpc-manager.notifications.test.mjs`

两处均移除对本机 `PI_TASK_TMPDIR` 的硬 assert，新增 `node:os` 的 `tmpdir`，使用
`mkdtempSync(join(process.env.PI_TASK_TMPDIR ?? tmpdir(), prefix))`。无需安装本机 wrapper；
`PI_TASK_TMPDIR` 优先，未设置时 Node 平台临时 API 尊重 `TMPDIR`。分隔符由 `join` 处理，
每次分配独占随机子目录，`rmSync` 仅删除该子目录，不删除传入临时根。

源码 review 与执行 setup 文本的 VM probe 确认：SDK/Jiti runtime import 前先设置独立
HOME/agentDir 并创建目录；offline/MCP、idle/stall 与 Jiti flags 保持在这两份测试的
Node 测试文件子进程内；`after` 清理保留。VM probe 只检验 setup 路径/环境/清理，
不冒充 SDK 生命周期测试；40 项定向测试另真实运行。

检查已加载归档 task 的 check.jsonl 全部条目及 PRD/design/implement、CI followup/implementation。
没有递归 dispatch、workflow、commit/push/GitHub、服务启停、next build、真实 agent 写入，
未修改另一任务、task.json、其它任务文档或 spec。仅新增本报告及本轮验证证据；
update-spec、最终 archive/journal 仍由主代理负责。

## 最终门禁

证据目录：`research/validation-logs/pr-33-ci-fix-check/safe-final/`。

| 验证 | exit | 实测结果 |
| --- | --- | --- |
| 无 PI_TASK_TMPDIR，TMPDIR 含空格 | 0 | 40 tests / 40 pass / 0 fail / 0 skip |
| PI_TASK_TMPDIR 与 TMPDIR 不同，优先前者 | 0 | 40 / 40 / 0 / 0 |
| TMPDIR 与 PI_TASK_TMPDIR 均未设置（平台 `/tmp`） | 0 | 40 / 40 / 0 / 0 |
| 4 个 setup probe（两文件 × fallback/priority） | 0 | 路径、隔离 flags、cleanup 全通过 |
| 完整 `npm test`，无 PI_TASK_TMPDIR | 0 | 3005 tests / 13 suites / 3005 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo |
| 完整 `npm run lint`，JSON formatter | 0 | 733 files / 0 error / 0 warning / 0 fatal |
| 完整 `tsc --noEmit --incremental false` | 0 | 无诊断 |
| `npm ls --include=dev` | 0 | 依赖树有效 |

与同任务上轮 tablet-check 最终门禁（733 文件、3005 tests）一致，本轮没有新增/删除测试。
固定 `e0ad630` baseline 的 698 文件、2853 tests 是功能开发前的历史基线，不是本轮候选数。
复用当前 checkout 既有 npm 依赖，不重新安装/复制依赖；锁和 npm 元数据、906 个已安装
包的版本逐一一致，缺少的 75 个全为 optional 包，没有 non-optional 缺失或版本差异。
无 `.pnpm/.ignored/.modules.yaml` 混装痕迹。TS 5.9.3、ESLint 9.39.4、Next/config 16.3.6、
嵌套 hooks plugin 7.0.1，四个 Pi direct pin 均 1.0.0。没有声称本轮新建 `npm ci` 树。

## 真实命令与隔离

首次 shell：TMPDIR=`/home/xupeng/.cache/pi-tmp/01a1119c-b77e-719c-b08f-b4be6c639de7`，
PI_TASK_TMPDIR 未设置。Node v24.21.0 / npm 11.19.0；未另外复跑 CI 的 Node22.19.0。

外层资源保护命令（第三轮为最终结果，前两轮失败证据也保留）：

```bash
/home/xupeng/.pi/agent/bin/pi-tmp-run pr-33-ci-fix-check -- \
  node .trellis/tasks/archive/2026-10/10-06-notification-center-sync/research/validation-logs/pr-33-ci-fix-check/run-check.mjs
```

harness 的 `spawnSync` **显式白名单 env**（等效 env-i，不继承 provider 密钥或全局 flags），
完整环境留在 `safe-final/environment.json` 与 `full-environment.json`。最终唯一小 fixture 根为
`/var/tmp/pr-33-ci-fix-check-tSjDDA`，HOME=`<root>/home`，agentDir=`<root>/agent`，
全量 TMPDIR=`<root>/tmp`，另有独立 XDG config/cache；无全局 PI_OFFLINE、
PI_WEB_DISABLE_MCP、PI_TASK_TMPDIR、NODE_OPTIONS。定向 TMPDIR=`<root>/tmp with spaces`，
优先路径另设 PI_TASK_TMPDIR=`<root>/priority`。实际子命令：

```bash
env -u PI_TASK_TMPDIR node --experimental-strip-types --test lib/agent-run-observer.integration.test.mjs lib/rpc-manager.notifications.test.mjs
# 相同两文件，子进程 env 的 PI_TASK_TMPDIR=<root>/priority：
node --experimental-strip-types --test lib/agent-run-observer.integration.test.mjs lib/rpc-manager.notifications.test.mjs
env -u TMPDIR -u PI_TASK_TMPDIR node --experimental-strip-types --test lib/agent-run-observer.integration.test.mjs lib/rpc-manager.notifications.test.mjs
env -u PI_TASK_TMPDIR npm test
npm run lint -- --format json --output-file <evidence>/safe-final/eslint.json
node_modules/.bin/tsc --noEmit --incremental false
npm ls --include=dev
```

`/var/tmp` 实测 btrfs 主磁盘；根、`/var`、`/var/tmp` 与唯一 fixture 根均无 `.agents/skills`
或 `.pi`，避免 isolated HOME 将真实 `/home/xupeng/.agents/skills` 误判为项目祖先资源。
此处只放小 fixture/临时用户数据，不放源码、node_modules 或 worktree；全量 runner
不借全局 offline/MCP flags 掩盖其它测试，也没有恢复真实 HOME 来求通过。

## 非绿尝试保留与归因

1. 证据目录根的首次 `targeted-fallback.log` 为 40/40 pass；harness 随后要求 TMPDIR
   完全为空，因 SDK/Node24 的 `node-compile-cache` 断言失败，未跑全量。调整仅属于
   review harness：允许这一个编译缓存名称，同时严格检查其它残留；缓存也在自有根内
   整体清理。不是产品测试失败，也不是两个 fixture 的泄漏。
2. `final/` 是第二轮保留的中间结果，三种定向形态均 40/40；全量为 **3001/3005，4 fail**。
   未改动的 `app/api/mcp/test/route.test.mjs:61` 与
   `app/api/mcp/sign-in/route.test.mjs:71` 使用 `!touch ${marker} && echo ...`，没有 shell 引号。
   含空格的 TMPDIR 使 marker 命令拆词，导致 1 项 MCP test 与 3 项 sign-in 测试失败。
   这是已有测试 fixture 的路径假设，不是这次 fallback 或 MCP 产品行为缺陷；未扩大修复。
   同源/同依赖，仅全量 TMPDIR 换无空格的 `<root>/tmp` 后 3005/3005。含空格仍单独验证
   本次两文件通过，不能据此声称其它测试都支持空格。
3. 拆词命令还在仓库根创建了本轮自有空文件 `with`；开始 status 中不存在，stat 确认
   为本轮失败时间创建的 0-byte 普通文件。检查代理以精确 apply_patch 删除，不宽泛删除。

## 源身份与清理

HEAD=`fc8267471cc913ee8c5664efd58b154f6082ff83`；branch=`feat/notification-center-sync`。
最终门禁前后 916 个 tracked 源/配置/测试/e2e 文件 SHA-256 完全一致，完整清单保存在
`safe-final/source-hashes-before.json` 与 `source-hashes-after.json`；不覆盖历史 manifest。

| 文件 | SHA-256 |
| --- | --- |
| lib/agent-run-observer.integration.test.mjs | ae2a1254e0ff6f27a7c702d7f76ed92e312b46476f7dbf69b109dbfe0bec50a9 |
| lib/rpc-manager.notifications.test.mjs | a47222598319228cc209e45041cb91752e9f7b46e91fa8a42a4d516fef07604c |
| package.json | 8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713 |
| package-lock.json | 18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f |

三轮 `/var/tmp/pr-33-ci-fix-check-{E7TuKG,HK4SBd,tSjDDA}` 根及三个 wrapper workspace
`pr-33-ci-fix-check-{0xwxwtln,qjcseqc6,wu52ccsa}` 已精确清理并检查不存在。
默认 `/tmp` 的两种 fixture 前缀只读扫描残留为 0；`/tmp/node-compile-cache` 是
2026-10-04 已存在的共享 Node 缓存，不按宽泛规则删除。自身根内的编译缓存均随根清理。
未留下验证子进程；收尾 pgrep 仅命中审计命令自身。PID 1118376/1118396（用户8505）与
1005816（正式实例）仍存在，没有发服务请求或发送信号。另一 task/worktree 不触碰。
仅保留正式 research 证据与 harness；`safe-final` 原始证据约 0.7 MB，没有 browser 产物。

## 明确未覆盖

本轮只复跑两文件的测试定义与完整静态/Node 门禁。已有产品矩阵、真实 SDK/public API
browser、布局/双设备同步/重启等浏览器历史证据仍冻结；本轮没有重跑任何 browser，
不能将 test-only CI 返工说成重新验收 AC1–AC14。Windows、Safari、iOS 真机与 Node22
本轮未运行；这些保留原披露边界。
