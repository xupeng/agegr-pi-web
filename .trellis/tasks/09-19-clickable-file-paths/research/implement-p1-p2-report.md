# 实施报告：修复 check-report 的两个已确认缺口（P1 / P2）

任务：`.trellis/tasks/09-19-clickable-file-paths`
范围：只修 `research/check-report.md` 的 P1（索引死链）与 P2（产物卡片缺子会话来源），未做其它重构。

---

## P1：索引不再包含工作树中已删除的受跟踪文件（AC8）

### 实现位置

- 新增纯函数 `lib/file-index-paths.ts:17` `subtractDeletedPaths(listed, deleted)`：
  按 `listed` 原顺序过滤掉 `deleted` 中的路径；`deleted` 为空时返回 `[...listed]`（不改入参）。
- `app/api/file-index/route.ts:13` 引入该函数；`listWithGit()` (`route.ts:62-89`)：

  ```ts
  const [listed, deleted] = await Promise.all([
    execFileAsync("git", ["-C", cwd, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {...}),
    execFileAsync("git", ["-C", cwd, "ls-files", "--deleted", "-z"], {...}).catch(() => ({ stdout: "" })),
  ]);
  const all = subtractDeletedPaths(
    listed.stdout.split("\0").filter(Boolean),
    deleted.stdout.split("\0").filter(Boolean),
  );
  ```

  两条命令沿用同一 `execFileAsync` 选项（`timeout: 10_000`、`maxBuffer: 64MB`、`LC_ALL: "C"`）。
  `--deleted` 失败（极老 git）时 `.catch` 退化为 `stdout: ""`，即保留旧行为，而不是让整条路由失败。

### 实测证据（临时仓库）

- 基本：`git add gone.md` 后删除磁盘文件，`--cached --others` 仍输出 `gone.md`，`--deleted` 输出 `gone.md` → 差集后消失。
- 路径含空格 / 中文：`gone file.md`、`中文 gone.md` 均正确差集（`-z` NUL 分隔）。
- 空输出：`--deleted` 无匹配时为空串，`split("\0").filter(Boolean)` → `[]` → 差集为恒等。
- `--others`（未跟踪）不可能出现在 `--deleted`，因此差集只影响「已跟踪且工作树已删」的条目。
- 稀疏检出（sparse-checkout cone）：`--deleted` 对 sparse-excluded 文件返回空，本改动不触碰这些条目（索引仍会列出稀疏缺文件的既有行为不变，非本缺口范围）。
- 子模块：子模块工作目录被删除后，`--deleted` 报 `sub`，差集会把该 gitlink 路径移出索引。这属于改善（原先会把 `sub` 当文件链接化 → 打开目录报错），不是回归。

### `/api/file-index` 生产语义变更与影响面（必须记录）

- 变更方向：**不再提供工作树中已删除的受跟踪文件**。这是修正死链（D2），而非新功能。
- 影响消费者（该路由同时服务）：
  - `components/ChatInput.tsx` 的 `@` 补全：已删除文件不再出现在候选里（符合预期）。
  - `components/FileExplorer.tsx` 搜索：同上；同时 `ChatWindow`/`MessageView` 的链接化索引（`hooks/useFileIndex.ts`）也拿到同一份更准确的列表。
- **未改变**：无 `q` 与有 `q` 的响应形状、`MAX_FILES=5000` / `GIT_HARD_CAP` / `truncated` 语义、`CACHE_TTL_MS=10_000` 与 `CACHE_MAX_ENTRIES=20`、非 git 仓库回退 `listWithWalk`（该回退只列存在的文件，未加任何 I/O）。
- 代价：每次缓存重建（TTL 10s）多一次 `git ls-files --deleted` 子进程；两次调用并行，量级与原来单次 `git` 相同。

---

## P2：产物卡片携带子会话 `sourceSessionId`（AC6）

### 实现位置

- `lib/written-file-sources.ts`
  - `WrittenFile.sourceSessionId?: string` (`:60`)、`RawWrittenFile.sourceSessionId?: string` (`:71`)。
  - `extractSubagentSnapshotWrittenFiles()` (`:326`)：从 `details.sessionId` 经 `nonEmptyString` 运行时守卫取值（`details.kind === "pi-web-subagent"` 已在函数入口校验），合法非空时给每个文件写入 `sourceSessionId` (`:331,348`)；trellis / tool-input / apply_patch 来源不填，保持 `undefined`。
  - `resolveAndMergeWrittenFiles()` (`:421`)：新增路径保留 `sourceSessionId` (`:445`)；同路径重复出现时，若首见条目缺 `sourceSessionId` 而后续条目有，则**回填** (`:435-436`)，顺序不变；两边都有时保留首见值。
- `components/TurnWrittenFiles.tsx`
  - `OpenWrittenFileHandler` options 增加 `sourceSessionId?: string` (`:20`)。
  - 每张卡片据 `sourceSessionId` 生成 `openOptions` (`:107`)，主点击 (`:124`)、Open preview (`:197`)、Open diff (`:198`) 全部透传。
- `components/MessageView.tsx`：`Props`、`AssistantMessageView`、`CustomMessageView` 的 `onOpenFile` 类型拓宽为 `OpenWrittenFileHandler`（纯类型显式化，运行时行为不变；`MarkdownBody`/`PathText` 仍按位置参数调用，天然走「选中会话」语义）。
- `components/AppShell.tsx:1039` `handleOpenLinkedFile`：
  ```ts
  (filePath, options?: { modeHint?: "diff"; sourceSessionId?: string }) => {
    handleOpenFile(filePath, getFileName(filePath), {
      sourceSessionId: options?.sourceSessionId ?? selectedSession?.id ?? null,
      modeHint: options?.modeHint,
    });
  }
  ```
  产物卡片传入的 `sourceSessionId` 优先；`MarkdownBody`/`PathText` 不传 → 回落 `selectedSession?.id ?? null`，与既有语义完全一致。

### tab 身份 / 重开行为确认

`components/file-tab-state.ts` 的 `sourceSessionId` 是 tab 身份的一部分，现有 `openFileTab` 已按 `sourceChanged` 处理，无需改动：

- 同一路径先以子会话 id 打开、再以父会话打开（或反向）：`sourceChanged` 为真 → 更新 `sourceSessionId` 并 `viewerRevision++`，`FileViewer` 以新来源重挂载，不会错乱。
- 首见为 `null`/`undefined`、后见为真实 id：`sourceChanged` 为真 → 升级。
- 首见为真实 id、后见为 `null`（无选中会话的 trellis 卡片）：`input.sourceSessionId && ...` 短路为假 → 不降级、不重开（既有行为，未改动）。
- 两端都为空：不重开（正确）。

### 为什么这样最稳

check-report 已经指出「B1 完成时快照」是首选方案；本改动只把该快照里已经存在的 `details.sessionId`（`lib/subagent-extension.ts:95` 始终写入）透传到打开链路，**没有新增回读子会话文件、没有新路由、没有改 `lib/trellis-subagent-records.ts`**，前台 toolResult 与背景 `pi-web:subagent-notification` 的 custom_message 两条路径一次性覆盖（后者在 `CustomMessageView` 也复用同一解码器）。

---

## 新增 / 修改的测试用例

| 文件 | 用例 |
|---|---|
| `lib/file-index-paths.test.mjs`（新增，6 例） | 正常差集保序；deleted 为空；listed 为空；含空格/中文/emoji；deleted 里有 listed 不存在的路径；不改入参 |
| `lib/written-file-sources.test.mjs`（+3 例，改 1 例预期） | 「reads the built-in Agent completion snapshot」补断言 `sourceSessionId: "child"`；新增「无 session id 时来源保持 undefined」；「后续同路径条目回填 sourceSessionId 且不重排」；「两边都有时保留首见值」 |
| `lib/turn-written-files.test.mjs`（+3 例，既有用例未改） | Agent 快照条目带 `sourceSessionId`；同轮先 write 再 Agent 写同一路径时回填；trellis 条目 `sourceSessionId` 恒为 `undefined` |
| `components/TurnWrittenFiles.test.mjs`（+1 例） | 源码级断言：卡片把 `openOptions`（含 `sourceSessionId`）传给主点击 / preview / diff 三个动作 |

---

## 门禁结果（最后一次源码修改之后）

| 命令 | 退出码 | 计数 |
|---|---:|---|
| `node_modules/.bin/tsc --noEmit` | 0 | 0 诊断 |
| `npm run lint` | 0 | No issues found（0 error / 0 warning） |
| `npm test` | 0 | **1311 tests / 1311 pass / 0 fail / 10 suites / 0 skipped** |

基线对照：check-report 结束时 **1298 = 1282 + 16**。本轮新增 **13** 例 = file-index-paths 6 + written-file-sources 3 + turn-written-files 3 + TurnWrittenFiles 1 → **1311 = 1298 + 13**。逐项吻合。
依赖树未变动（未执行 `npm install`）。未执行 commit。未触碰 `.pi/extensions/trellis`、`lib/trellis-subagent-records.ts`、`lib/git-changes.ts`、`lib/git-types.ts`、`components/FileExplorer.tsx`、`.trellis/spec/`。

---

## 仍有风险 / 未覆盖

1. **`--deleted` 的子模块语义**：实测删除子模块工作目录会报 `--deleted`，差集将其移出索引（改善）。但未覆盖「子模块部分初始化 / `.gitmodules` 指向缺失」等更深边界；这些情形下最多是少列一个不可打开路径，不会产生死链。
2. **`--deleted` 稀疏检出**：本机 git 2.55 实测不报 sparse-excluded 文件，无回归；更老 git 的 sparse 行为未逐一验证。若极端情况下误报，会导致稀疏文件不被索引（少列而非死链），可接受。
3. **索引异步性 / 10s 缓存**：刚删除文件后 10s 内客户端可能仍持有旧列表（既有缓存语义，未改动）。本改动不引入新的时序问题。
4. **`sourceSessionId` 只在内建 `Agent` 快照来源存在**：trellis 来源与旧会话（details 无 `writtenFiles` 快照）仍以选中父会话 id 打开；这是已知的范围限制，check-report 已记录，未在本轮扩大。
5. **P2 的静态测试为源码级断言**：仓库无 jsdom/交互测试设施，`TurnWrittenFiles` 的点击回调无法在 SSR 下触发；数据层面的提取与回填由 `lib` 单测覆盖，卡片到回调的透传以源码断言兜底。
6. **`tests: 1311` 的依赖树一致性**：与 check-report 相同的限制——用的是 checkout 现有 `node_modules`，未做隔离 `npm ci` 基线复核；本轮未安装依赖、未改 lock/config。
