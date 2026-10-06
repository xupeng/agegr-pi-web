# Notification center：固定 ref 验证基线与可复用工作区

验证日期：2026-10-06（UTC 10:14–10:20）。本轮只建立 baseline；**没有验证 notification-center candidate，也没有执行 AC1–AC13 功能验收**。

## 1. 范围与来源

- 已读取任务 `implement.md`、`acceptance.md`、`implement.jsonl`、`.trellis/spec/frontend/quality-guidelines.md`、主仓 `AGENTS.md` 和 `/home/xupeng/.pi/agent/AGENTS.md` 的全局临时工作区规则，并检查 `pi-tmp-run` 的隔离/清理行为。
- 首次 shell 的主 cwd 为 `/home/xupeng/dev/personal/forked/agegr-pi-web`；分支为 `feat/notification-center-sync`；指定验证目录不存在，未覆盖已有目录。
- 原始 TMPDIR：`/home/xupeng/.cache/pi-tmp/01a110b4-8588-7540-97bf-c3e2a2b81ae0`。源码及 node_modules 均不放此缓存，也不放 `/tmp`。
- 独立、主磁盘、detached worktree：**`/home/xupeng/dev/personal/forked/agegr-pi-web-notification-validation-01a11076`**。
- 创建命令：`git worktree add --detach /home/xupeng/dev/personal/forked/agegr-pi-web-notification-validation-01a11076 e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`。
- Baseline commit：`e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`；tree：`68f33b9a40afb37f23404351b72977c6c7066bf8`。
- 全部源码检查来自该 worktree 的固定 ref，没有拿主仓并发代理的中途产品修改作为 baseline；没有更改 baseline 产品源、提交、push、build 或启动产品服务。

正式日志均在本任务 `research/validation-logs/baseline-01a11076/`，临时检查输出已迁入，失败证据不依赖缓存保留。

## 2. 环境与干净锁依赖

| 项目 | 实测 |
| --- | --- |
| Node / npm | `v24.21.0` / `11.19.0` |
| 安装 | 初始无 node_modules；`npm ci --include=dev`，退出码 **0** |
| 安装统计 | added 906 packages；audited 907 packages |
| lockfileVersion | 3 |
| 四个 Pi 包 | pi-agent-core / pi-ai / pi-coding-agent / pi-tui：声明、锁和实装均 **1.0.0** |
| TypeScript / ESLint | `5.9.3` / `9.39.4` |
| eslint-config-next / Next | `16.3.6` / `16.3.6` |
| React Hooks lint 插件 | `node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks`：锁和实装均 `7.0.1` |
| pnpm 混装迹象 | `.pnpm` / `.ignored` / `.modules.yaml` 均不存在 |
| npm 安装元数据 | `node_modules/.package-lock.json` 存在，是本次 npm ci 正常生成，不单独据此判为混装 |
| 依赖保留状态 | node_modules 已安装并保留，约 **1.4 GiB**；未复制其他仓库依赖 |

安装前后及两轮检查后 SHA-256 均一致：

```text
package.json      8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713
package-lock.json 18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f
```

安装也在 `pi-tmp-run` 内隔离 HOME/PI_CODING_AGENT_DIR，并清除 NODE_ENV。保留 npm ci 默认安装行为，没有执行 npm audit fix 或修补依赖。npm 报告 17 个 vulnerabilities（6 low、4 moderate、7 high），以及 install-scripts 审批提醒；这些属于安装输出，不是本轮新增功能的安全/原生终端验证结论。

## 3. 两轮退出码及最终可比基线

每轮所有检查使用同一棵干净 npm ci 锁依赖树，在 `pi-tmp-run` 内执行。检查子进程使用 `env -i`，只提供 PATH、隔离 HOME/PI_CODING_AGENT_DIR、临时目录、XDG 目录、LANG 与日志目录；未传真实 agent/session 路径、认证配置或 provider 密钥。

| 命令 / 计数 | 首轮：缓存下隔离 HOME | 修正隔离环境后的最终 baseline |
| --- | --- | --- |
| `node_modules/.bin/tsc --noEmit` | **0** | **0** |
| `npm run lint` | **0** | **0** |
| `node_modules/.bin/eslint . -f json -o <临时输出>` | **0** | **0** |
| ESLint 文件数 | **698** | **698** |
| ESLint error / warning / fatal | **0 / 0 / 0** | **0 / 0 / 0** |
| `npm test` | **1** | **0** |
| tests / suites | **2853 / 13** | **2853 / 13** |
| pass / fail | **2830 / 23** | **2853 / 0** |
| cancelled / skipped / todo | **0 / 0 / 0** | **0 / 0 / 0** |
| 单测 duration_ms | 25126.076729 | 26215.758786 |

最终可比较的 baseline 为右列。首轮失败未抹掉，不把失败轮误写为通过，也没有靠修改产品源/测试源获得通过。

### 首轮 23 项失败的具体来源与隔离修正

锁定 SDK 的 `dist/core/trust-manager.js` 中，`hasTrustRequiringProjectResources()` 向 cwd 的祖先目录扫描 `.agents/skills`，仅排除当前 HOME 对应的用户 skills 目录。真实 `/home/xupeng/.agents/skills` 存在；当 HOME 变成缓存下的独立目录时，它不再满足该排除条件。缓存里的空 fixture 因祖先路径被判为需要 project trust，导致以下预期偏移：

| 源文件 | 失败数 | 测试定义行 |
| --- | --- | --- |
| `app/api/mcp/route-add.test.mjs` | 7 | 162、193、206、219、252、266、276 |
| `app/api/project-trust/route.test.mjs` | 2 | 141、214 |
| `lib/builtin-extensions.test.mjs` | 1 | 101 |
| `lib/project-trust.test.mjs` | 13 | 36、151、182、193、302、322、340、361、422、462、547、569、601 |

具体表现包括：空目录 `requiresTrust: true` 而预期 false；fresh-folder 操作提前返回 `folder-not-fresh` / 409，而预期成功、rollback 或写失败；空资源时 codemode 配置的 trust 分支偏移；队列写回调因提前拒绝未被执行。全部名称、断言和栈见 `tests.log`，逐项名称/定义位置索引见 `failure-sources-and-dependencies.log`。

仅改变隔离测试环境复跑全套：在 `pi-tmp-run` 内通过 `mktemp -d -p /var/tmp notification-validation-01a11076.XXXXXXXX` 创建本轮唯一 fixture 根，把 HOME、PI_CODING_AGENT_DIR、TMPDIR、XDG 目录指向其子目录。保留包装器的 PI_TASK_TMPDIR 用于生成/迁出日志。**这是 TMPDIR 的显式安全修正**：避开真实用户 HOME 的祖先 skills，不恢复真实 HOME、不删除真实 skills、不伪造 trust 决策。

已事先验证 `/var/tmp` 位于 `/dev/mapper/root` 的 **btrfs 主磁盘**（不是 `/tmp` 的 tmpfs），并检查 `/var`、根目录不存在被检查的祖先资源。这里只放临时 fixture/隔离用户数据，不放源码 worktree 或 node_modules；外层 trap 精确清理自己的 mktemp 根。修正后同 ref、同锁、同依赖的 2853 项测试全通过，支持将首轮差异归因于测试路径祖先污染。

## 4. 日志索引

相对目录：`research/validation-logs/baseline-01a11076/`。

- `setup.log`：初始 TMPDIR、版本、worktree 清单、固定 ref 创建。
- `install.log`：干净 npm ci、初始锁哈希、退出码及 npm 提醒。
- `checks.log`、`tsc.log`、`lint.log`、`eslint-json.log`、`eslint.json`、`tests.log`：首轮完整证据；`tests.log` 是首轮失败原始输出。
- `counts-and-ancestor-probe.log`、`safe-tmp-probe.log`：ESLint 计数、祖先存在性、主磁盘检查。
- `safe-checks.log`、`safe-tsc.log`、`safe-lint.log`、`safe-eslint-json.log`、`safe-eslint.json`、`safe-tests.log`：隔离修正后的正式 baseline。
- `final-state.log`：实际锁依赖版本、两轮 lint 计数、锁哈希、干净源码状态、清理确认。
- `failure-sources-and-dependencies.log`：全部 23 项失败名称/位置及 `npm ls --include=dev`（退出码 0）。
- `dependencies-and-counts.log`：中间元数据收集器因未 export LOGROOT 报 ENOENT；不是 tsc/lint/test 失败。计数已在后续两份计数日志中重新成功采集。`safe-tmp-probe.log` 末尾探测 apply_patch 可执行名未找到使该探测 shell 返回 1；磁盘探测本身正常。报告使用 Codex 内置 apply_patch 入口落盘。

## 5. 后续 candidate 复用方法

**保留唯一源码 worktree 与已安装 node_modules；本轮不创建第二份，也不移除它。** 它当前仍 detached 于 baseline ref，tracked/untracked 源码状态干净；已清理本轮生成的 `tsconfig.tsbuildinfo`，没有 `.next`。

1. 由协调者提供明确、不可变的 candidate commit/tree 快照，不从主仓正在变化的未提交源码即时读取或 rsync。
2. 在上述同一 worktree 核查 `git status --short` 后，切换至授权 candidate ref（例如 `git switch --detach <candidate-ref>`）；不要 reset 主仓、不要替他人 stage/commit。
3. 核验 package.json/package-lock.json 哈希、四个 Pi pins 与本报告一致性。推荐在**同一路径**重新 `npm ci --include=dev` 建立 candidate 干净依赖树；不复制 node_modules、不创建第二 worktree、不用 npm install 修补。
4. 使用上节经过验证的外祖先隔离环境复跑 tsc/lint/npm test，保存到新的本轮日志目录；对照 **698 文件、0 诊断、2853 tests**，计数变化按新增/删除文件、用例及依赖归因。候选存在测试失败时不能拿数字变小/首轮 23 项失败当豁免。
5. 有 UI/SDK/跨设备验证需求时需另按 acceptance 执行并记录。本轮三件套不替代真实通知行为、浏览器验收或 ≤3 秒同步量测。

核心隔离方式（在 pi-tmp-run 的命令内部；日志需在退出前迁至正式目录）：

```bash
fixture_root=$(mktemp -d -p /var/tmp notification-validation-01a11076.XXXXXXXX)
trap 'rm -rf -- "$fixture_root"' EXIT
mkdir -p "$fixture_root/home" "$fixture_root/agent" "$fixture_root/tmp"
env -i PATH="$PATH" LANG=C.UTF-8 \
  HOME="$fixture_root/home" PI_CODING_AGENT_DIR="$fixture_root/agent" \
  TMPDIR="$fixture_root/tmp" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
  XDG_CONFIG_HOME="$fixture_root/config" XDG_CACHE_HOME="$fixture_root/cache" \
  bash -c 'node_modules/.bin/tsc --noEmit; t=$?;
           npm run lint; l=$?;
           npm test; n=$?;
           printf "tsc=%s lint=%s tests=%s\n" "$t" "$l" "$n";
           test "$t" -eq 0 && test "$l" -eq 0 && test "$n" -eq 0'
```

复用前仍需检查 `/var/tmp` 磁盘和祖先资源现状；不存在可复算安全目录时应停止，不切回真实 agent/HOME 求通过。

## 6. 收尾与未覆盖

- 安装/两轮检查的三个 pi-tmp-run 工作目录，以及 `/var/tmp/notification-validation-01a11076.ExlhAF4H` 均已确认不存在；失败唯一原始证据已进入正式 research 日志。
- 未自行启动开发/生产服务或收费 provider；npm test 自有 fixture 子进程随有限验证命令结束，由包装器清理进程组。收尾未检出带本轮 worktree/fixture 标识的 node/npm/包装器残留进程。
- 没有修改主仓产品代码、baseline 产品代码或测试代码；没有提交/push；没有运行 next build。
- **未覆盖**：candidate 功能、AC1–AC13、真实浏览器、Safari 16.2、iOS 真机、Windows、通知同步时延、真实原生终端运行。基线全绿不表示这些功能通过。
- 留存项仅为上述独立 worktree（含约 1.4 GiB 锁依赖），供同任务 candidate 复用。最终收尾由用户/协调者确认后检查状态并执行 `git worktree remove /home/xupeng/dev/personal/forked/agegr-pi-web-notification-validation-01a11076`；不直接 rm -rf 源码工作区。
