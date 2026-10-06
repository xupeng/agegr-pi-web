# Baseline hermetic 全量测试补充验证

## 结论与范围

同一唯一 clean npm-ci 依赖树、原 ref `128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f`：

| 运行 | tests / suites | pass / fail | cancelled / skipped / todo | exit |
| --- | --- | --- | --- | --- |
| 前轮 strict PI_OFFLINE=1（不带 preload） | 2758 / 13 | 2754 / 4 | 0 / 0 / 0 | **1** |
| 本轮 hermetic，hash 限定 mock-only worker preload + unshare-net | **2758 / 13** | **2758 / 0** | **0 / 0 / 0** | **0** |
| 安全诊断（plugin 5 例 + portable bridge 14 例） | 19 / 0 | 19 / 0 | 0 / 0 / 0 | **0** |

全量耗时 `42451.536434ms`。正式输出为 `baseline-tests-hermetic.log`、`baseline-hermetic-wrapper.log`、`baseline-hermetic-exit.log`。前轮 strict 4 失败仍完整保留在 `baseline-tests.log` 与 `baseline-validation.md`，**不覆盖、不改写成通过**。前轮 tsc exit 0、eslint 704 files / 0 errors / 0 warnings / exit 0 不变；本轮只重跑 npm test，未再安装。

没有修改产品/既有测试/lock，没有切换、读取或复制 candidate。worktree 仍是 detached original HEAD，git status 空：

```text
/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
```

package-lock SHA256 仍为 `18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`。Node `v24.21.0`、npm `11.19.0`；依赖来自前轮原树 `npm ci --include=dev`，没有第二棵验证依赖树。

## Preload 安全审查与实际 worker 证据

主代理提供、仅用于 research 的 `test-isolation-preload.mjs` 已完整读取，未修改。其本次 SHA256：

```text
8ea74f498b1146d99273c14d08a79a4119410465ab6fac81a443be29f17aebd5
```

同时满足以下条件才改变该进程的 PI_OFFLINE：

1. `PI_TEST_MOCK_UPDATE_CHECKS=1`；
2. `process.argv[1]` 的 basename 为 `plugin-updates.test.mjs`，父目录 basename 为 `lib`；
3. 进入时 `PI_OFFLINE` 必须严格为 `1`（assert）；
4. 该 worker 文件完整 SHA256 必须为 **`99043c5dc642b3e70af10c72e6432c90379d562ff090be5a027e66e4ed170d11`**（assert）。

这不是写死 baseline 绝对路径，而是 **lib/文件名 + 完整内容 hash + 显式 opt-in**，以便候选树中的同一未改文件复用。如果其内容变化，preload 明确断言失败，必须重新审查，不能为 green 盲改 hash 或扩大匹配。只有匹配 worker 的进程环境变为 `PI_OFFLINE=0`，preload 不修改协调进程、其他 worker、真实设置或产品 gate。

已完整阅读原 baseline `lib/plugin-updates.test.mjs` 五例：第一例是纯 source-checkable 判断；四个更新检查场景所有 `checkPluginUpdates` 调用均传入 `packages` 和 `runCommand` mock，包括 missing/failed 路径、npm range 和 Git ref 比较。`lib/plugin-updates.ts:176-188` 因传入 packages 而不创建真实 SettingsManager/PackageManager，runner 使用所给 mock；不执行 npm/git 远端命令。这四例原先失败的原因仍是 `:197-198` 的 strict offline guard 先于 mock 执行。

研究探针 `baseline-hermetic-safety.mjs` 在上述网络 namespace 内实测 Node test 子进程 argv，附加只读 audit import，日志在 `baseline-hermetic-safety.log`：

- plugin worker：`argv[1]=<baseline>/lib/plugin-updates.test.mjs`、`NODE_TEST_CONTEXT=child-v8`、`PI_OFFLINE=0`；5/5 通过。
- portable bridge worker：`argv[1]=<baseline>/lib/ask-user/portable/bridge.test.mjs`、`NODE_TEST_CONTEXT=child-v8`、`PI_OFFLINE=1`；14/14 通过。
- 协调进程执行前后均 assert `PI_OFFLINE=1`。

**这是验证 harness 恢复一个已知 mock-only worker 的原测试环境假设，不是解除 runtime offline 要求，不是修改产品更新检查策略。** 其他 workers 的初始环境仍为 PI_OFFLINE=1，preload 不向它们授予例外。全量执行未使用安全诊断的 audit import，只有已审查 preload。

## 物理网络与文件系统隔离

全量及安全诊断均使用：

- `pi-tmp-run --keep-on-failure`，实际 TMPDIR 仍在 `/home/xupeng/.cache/pi-tmp/01a10fa1-d7ee-753b-a8de-d7aa28090808`，不是 `/tmp`；私有 scratch 内创建 HOME/agent。
- `env -i` 白名单只保留 PATH、TMPDIR、PI_TASK_TMPDIR、HOME、PI_CODING_AGENT_DIR、PI_OFFLINE=1、JITI_FS_CACHE=false，并明确额外加入两个 **validation-only** 值：NODE_OPTIONS preload 与 PI_TEST_MOCK_UPDATE_CHECKS=1。不继承 provider、代理或真实 NODE_OPTIONS。
- `bwrap --unshare-net` 创建只有 loopback 的私有网络 namespace；**不放开外网、不连接宿主网络**。
- `--ro-bind / /`，私有 scratch 单独 writable bind；`--dev-bind /dev /dev` 保证 git/bash/stdio fixture 能用 `/dev/null`。
- 私有 tmpfs 覆盖 `/home/xupeng/.agents` 和 `/home/xupeng/.pi`，只在子进程 mount namespace 遮蔽祖先 skills/真实 agent 数据，不改真实目录。

安全诊断实测：宿主 netns `net:[4026531833]`，子进程 `net:[4026532898]`，getifaddrs（Node `networkInterfaces()`）只有 `lo`，`/proc/net/route` 只有表头、无外网路由；在该 namespace 内 listen/connect `127.0.0.1` 返回 `loopback-ok`。因此本地 MCP faux server 可用，且不能访问宿主 localhost 服务或真实外部 provider。本轮全量没有网络 namespace 造成的测试失败。

没有真实模型请求，没有产品服务/next build/浏览器/系统配置或外部扩展修改，无 commit/push。

### 诊断 harness 的两次早期错误

- attempt1：复杂嵌套 shell 引号失败，exit 2；未执行目标 JS，记录在 `baseline-hermetic-safety-attempt1.log`。短暂误执行的 ImageMagick import 命令也立即因无 X server 退出，无残留。改用研究 `.mjs` 安全脚本消除引号问题。
- attempt2：错误地用宿主 bind-mounted `/sys/class/net` 断言 netns 接口，exit 1；sysfs mount 显示宿主接口，不代表进程当前 netns。改用真正 getifaddrs + `/proc/net/route` + loopback listen/connect 实测，安全断言全过；**没有取消 --unshare-net 或放开网络**。错误日志保留 `baseline-hermetic-safety-attempt2-wrapper.log`。

## 主代理可复用命令（候选完成后，不自动装载 candidate）

下面与本轮成功全量相同。主代理应在实现完成、已授权装载候选并记录候选 source snapshot 后，复用这个 **同一 worktree/node_modules**；本代理未执行切换。先核验候选 package/lock 与此树安装一致。若 lock 有意变化，应停止并按锁重建依赖，而不是继续拿旧树报通过；本任务当前没有 lock 改动。

从主目录执行，将 `LABEL` / `LOG` 设置为 baseline 或 candidate；不要覆盖原 strict 或 baseline hermetic 证据：

```sh
V=/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
R=/home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/10-06-ask-user-host-integration/research
LABEL=ask-user-candidate-hermetic
LOG=candidate-tests-hermetic.log

test "$(sha256sum "$V/package-lock.json" | cut -d ' ' -f1)" = \
  18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f || exit 1
test "$(sha256sum "$R/test-isolation-preload.mjs" | cut -d ' ' -f1)" = \
  8ea74f498b1146d99273c14d08a79a4119410465ab6fac81a443be29f17aebd5 || exit 1

pi-tmp-run --keep-on-failure "$LABEL" -- bash -c '
  set -u
  V=$1; R=$2; LOG=$3
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  cd "$V" || exit
  bwrap --unshare-net --ro-bind / / --dev-bind /dev /dev \
    --bind "$PI_TASK_TMPDIR" "$PI_TASK_TMPDIR" \
    --tmpfs /home/xupeng/.agents --tmpfs /home/xupeng/.pi \
    env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
      HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
      PI_OFFLINE=1 JITI_FS_CACHE=false PI_TEST_MOCK_UPDATE_CHECKS=1 \
      NODE_OPTIONS="--import=$R/test-isolation-preload.mjs" \
      timeout 180s npm test > "$R/$LOG" 2>&1
  rc=$?
  printf "npm_test_hermetic_exit=%s\n" "$rc" | tee "$R/$LOG.exit"
  exit "$rc"
' bash "$V" "$R" "$LOG" > "$R/$LOG.wrapper" 2>&1
```

本次 baseline 实际 label 为 `ask-user-baseline-hermetic`、stdout 为 `baseline-tests-hermetic.log`；退出与 wrapper 文件按本报告上文命名。候选应同时执行其 tsc/lint 和自己的真实系统包 bridge/runtime验收，本命令不是这些门禁或浏览器验收的替代。真实 runtime 探针不得选择 plugin test worker 文件名，不应设置 PI_TEST_MOCK_UPDATE_CHECKS 或 NODE_OPTIONS preload；保持自身隔离与 PI_OFFLINE=1。

## 清理与持有状态（本节更新前轮保留状态）

成功全量 scratch `ask-user-baseline-hermetic-_lcz4jq2` 和成功 safety scratch 已由 wrapper 自动清理。没有本轮失败 scratch 需要继续保留。

用户批准清理的前轮六个 scratch 均逐路径核验：位于同一 session-owned TMPDIR、非 symlink、uid=1000、正式 research provenance/log 存在；在相关进程扫描无匹配后，取得目录 exclusive nonblocking flock（无 pi-tmp 活动/继承锁），再逐一删除。完整 inode/uid/路径记录在 `baseline-hermetic-cleanup.log`：

- ask-user-baseline-checks-9xv29hnh
- ask-user-baseline-tests-cleanenv-nsvhhue3
- ask-user-baseline-probe-hkbc29oe
- ask-user-baseline-probe-3kwq3vui
- ask-user-baseline-final-tests-a42uw06e
- ask-user-baseline-final-tests-ifvkyuen

同样检查并清理本轮无继续用途的 safety 失败 scratch：`ask-user-hermetic-safety-rcz8sh52`、`ask-user-hermetic-safety-d_ruop4x`；日志已保全。没有宽泛 rm，没有触碰其他任务目录/旧 worktree/现有 PID，wrapper 均回收本次启动的进程组，结束检查未发现相关残留。

**唯一普通磁盘 baseline worktree 和 node_modules 继续保留，未自动清理。** 主代理 candidate 验证结束、确认无未保存改动后再 `git worktree remove <上述完整路径>`。前轮 baseline-validation.md 的失败 scratch “保留”是历史状态；以上逐路径清理记录是最新状态，原失败证据不变。
