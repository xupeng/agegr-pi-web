# PR33 CI 返工实施记录（临时目录可移植性，2026-10-06）

## 范围

仅修改两份测试的 setup，使缺少本机 `PI_TASK_TMPDIR` 的标准 `npm test` / GitHub runner
也能建立独占小型离线 fixture：

- `lib/agent-run-observer.integration.test.mjs`
- `lib/rpc-manager.notifications.test.mjs`

## 改动

两处同构：删除 module 初始化处的 `assert.ok(process.env.PI_TASK_TMPDIR, ...)`，改为

```js
const scratch = mkdtempSync(join(process.env.PI_TASK_TMPDIR ?? tmpdir(), "<prefix>-"));
```

并新增 `import { tmpdir } from "node:os";`（沿用仓库既有 `mkdtempSync(join(tmpdir(), prefix))` 惯例）。

保持不变：

- `PI_TASK_TMPDIR` 存在时仍优先（本机 pi-tmp-run）；
- `os.tmpdir()` 天然尊重 `TMPDIR`；
- SDK import 之前设置 `HOME` / `PI_CODING_AGENT_DIR` 隔离，`mkdir` 后才是后续 import；
- `PI_OFFLINE=1` / `PI_WEB_DISABLE_MCP=1` / idle+stall=0 / `JITI_FS_CACHE=false` 仅写入这两份测试进程自身；
- `after(() => rmSync(scratch, ...))` 清理责任不变；
- 未触碰 npm script、CI workflow、产品代码、SDK pins、mock 规模。

## 环境事实

```
TMPDIR=[/home/xupeng/.cache/pi-tmp/01a1119a-2664-719c-b08f-b4bd5a43166e]
PI_TASK_TMPDIR=[<unset>]
node os.tmpdir()=/home/xupeng/.cache/pi-tmp/01a1119a-2664-719c-b08f-b4bd5a43166e
```

## 验证命令与结果

1. fallback（本会话真实默认态：无 `PI_TASK_TMPDIR`，TMPDIR=本机 pi-tmp 缓存）

   ```
   node --experimental-strip-types --test lib/agent-run-observer.integration.test.mjs lib/rpc-manager.notifications.test.mjs
   ```

   `tests 40 / pass 40 / fail 0`（duration 2523.8ms）

2. 本机 `PI_TASK_TMPDIR` 优先（在其下新建小目录，跑完核对无残留并删除）

   ```
   PT=$(mktemp -d "$TMPDIR/pi-task-tmpdir-XXXXXX")
   PI_TASK_TMPDIR="$PT" node --experimental-strip-types --test <两文件>
   ```

   `pass 40 / fail 0`；`ls -A "$PT"` 残留 0 项；`rmdir` 后已删除。

3. 纯平台临时目录（CI 形态：`TMPDIR` 与 `PI_TASK_TMPDIR` 均未设置 ⇒ `/tmp`）

   ```
   env -u TMPDIR -u PI_TASK_TMPDIR node --experimental-strip-types --test <两文件>
   ```

   `pass 40 / fail 0`；`/tmp/run-observer-*`、`/tmp/rpc-notifications-*` 残留 0。

4. `npm run lint` → `ESLint: No issues found`
5. `npx tsc --noEmit` → exit 0，无输出

未运行 `next build`、未启动/停止任何服务、未写真实 HOME/agent 目录、未改另一任务目录。

## 遗留与责任

- 新增临时资源均已清理：PI_TASK_TMPDIR 测试目录已 rmdir；`/tmp` 与 pi-tmp 缓存下无 fixture 残留。
- 说明：本机 `TMPDIR` 下存在 `node-compile-cache/`（约 20MB，v24.21.0 条目），这是 Node 24
  默认的模块编译缓存，由 node 进程（含当前 CLI 与 `node --test`）自动写入同一 TMPDIR，
  非本次放置的产品源码/node_modules 副本；当前 CLI 进程共享该目录，故未删除以免动到运行中共享状态。
- 本改动已在工作区，未 commit / 未 push / 未操作 GitHub / 未归档任务。
- 主代理后续独立 check 可只跑上述 targeted 命令，无需重复全量 `npm test`。
