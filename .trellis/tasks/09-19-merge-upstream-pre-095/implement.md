# 执行手册：合并 upstream/main 并冻结 H

> 前置：`prd.md` 的 R1–R9 已读。所有命令在
> `/home/xupeng/dev/personal/forked/agegr-pi-web`（主 checkout，分支 `personal`）执行。
> 证据目录：`.trellis/tasks/09-19-merge-upstream-pre-095/research/`（下称 `$EV`）。

## D0 前置检查（不通过就停）

```bash
cd /home/xupeng/dev/personal/forked/agegr-pi-web
git branch --show-current                 # 期望 personal
git rev-parse HEAD                        # 期望 2415bdb（记录为 BASE）
git rev-parse upstream/main               # 期望 5e9b997（记录为 TARGET）
git merge-base HEAD upstream/main         # 期望 860698a
git status --porcelain                    # 期望仅有 3 个 .pi/agents/*.md 与 .trellis/ 任务目录
node -v                                   # 期望 v22.19.0（engines >=22.19.0）
```

判据：分支正确、工作区只含用户资产与新任务目录、无 `node_modules`/`.next` 相关意外改动。
若 `TARGET` 已不是 `5e9b997`，停下来报告，不自行决定。

## D1 记录锚点与用户资产哈希

```bash
mkdir -p "$EV/evidence"
{ echo "BASE=$(git rev-parse HEAD)"; echo "TARGET=$(git rev-parse upstream/main)";
  echo "MERGE_BASE=$(git merge-base HEAD upstream/main)"; } | tee "$EV/evidence/anchors.txt"
git status --short | tee "$EV/evidence/status-before.txt"
sha256sum .pi/agents/trellis-check.md .pi/agents/trellis-implement.md \
          .pi/agents/trellis-research.md | tee "$EV/evidence/user-agents-before.sha256"
```

同时测量 **lint 基线**（后续比对用）：

```bash
npm run lint 2>&1 | tee "$EV/evidence/lint-baseline.txt" ; echo "exit=${PIPESTATUS[0]}"
```

## D2 执行合并

```bash
git merge --no-ff upstream/main
```

预期：67 个文件自动合并，14 个文件冲突（清单见 `design.md` §3）。若冲突文件集合与此不符，
停下来重新评估（说明上游点或本地基线变了）。

## D3 逐文件解决冲突（底层 → 上层）

顺序（先底层库，后组件，最后 e2e，避免上层依赖未定的底层类型）：

```text
1  lib/tool-names.ts                    8  components/MarkdownBody.tsx
2  lib/turn-written-files.ts            9  components/MarkdownBody.test.mjs
3  lib/turn-written-files.test.mjs     10  components/MessageView.tsx
4  lib/rpc-manager.ts                  11  components/SessionSidebar.tsx
5  app/api/sessions/[id]/route.ts      12  components/AppShell.tsx
6  hooks/useAgentSession.ts            13  components/ChatWindow.tsx
7  components/ChatInput.tsx            14  e2e/run.mjs
```

每个文件：

```bash
git show :1:<file> > /tmp/base.txt     # 共同祖先
git show :2:<file> > /tmp/ours.txt     # personal
git show :3:<file> > /tmp/theirs.txt   # upstream
# 读三份 → 按 design.md §3 的处置决定写入结果 → 确认无冲突标记
grep -nE '^(<<<<<<<|=======|>>>>>>>)' <file>    # 必须无输出
git add <file>
```

**硬性禁令**：不得使用 `-X ours` / `-X theirs` / `git checkout --theirs` / `git checkout --ours`。

## D4 语义复核（自动合并文件）

按 `design.md` §4 清单逐项核对，每项在 `research/merge-execution.md` 写结论 + 证据命令。重点：

```bash
# session-reader: 确认上游的可见消息计数逻辑 + fork 增强都在
grep -n "rawWindowCap\|sliceActiveBranch" lib/session-reader.ts
grep -n "增量\|externalWrite\|readLatestSessionEntryId" lib/session-reader.ts
# i18n: 上游新 key 是否落到 zh-CN
grep -n "commandAutoCompact\|truncatedByOutputLimit\|resizeSidebarSections\|expandPanel" \
  lib/i18n/messages/zh-CN.ts
# e2e 接线
grep -n "appendFileSync\|checkFilePanel\|filePanelFixture\|APPEND\|PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH" e2e/run.mjs
# 无删除行证明
git diff --cached --diff-filter=D --name-only
```

## D5 验证矩阵（退出码即判据）

```bash
node_modules/.bin/tsc --noEmit ; echo "tsc=$?"
npm run lint 2>&1 | tee "$EV/evidence/lint-after.txt" ; echo "lint=${PIPESTATUS[0]}"
diff <(sort "$EV/evidence/lint-baseline.txt") <(sort "$EV/evidence/lint-after.txt")   # 逐条比对
npm test 2>&1 | tee "$EV/evidence/test-after.txt" ; echo "test=${PIPESTATUS[0]}"
```

定向复核（重点覆盖冲突文件与语义复核点）：

```bash
node --test \
  lib/turn-written-files.test.mjs \
  lib/tool-names.test.mjs \
  lib/session-reader.pagination.test.mjs \
  lib/session-reader-external-write.test.mjs \
  lib/session-reader-latest-entry.test.mjs \
  lib/apply-patch.test.mjs \
  lib/pi-web-node-args.test.mjs \
  lib/node-cli.test.mjs \
  lib/extension-widgets.test.mjs \
  lib/tool-call-expansion.test.mjs \
  hooks/useResizablePanel.test.mjs \
  components/ChatInput.streaming-thinking.test.mjs \
  components/MessageView.test.mjs \
  components/MarkdownBody.test.mjs \
  components/SessionSidebar.test.mjs \
  ; echo "targeted=$?"
```

（以实际存在的文件为准；仓库中不存在的路径从清单去掉并在报告里说明。）

**e2e 决策（2026-09-19 用户确认）**：本次**不跑** `npm run test:e2e`。
原因：主 checkout 存在陈旧的 `.next/dev/lock`（30141 无监听），且 e2e 历史存在间歇失败，
会把不确定信号混进合并判据。代价是 UI 交互层（可拖拽侧栏、PDF `#page=`、图片预览、
文件面板切换）只有单测与类型检查覆盖；该限制必须在 `research/merge-execution.md` 的
「未覆盖项」中显式记录，并作为发布批准门的已知残余风险提交给用户。

判据汇总：`tsc=0`；lint 与基线**完全相同**（新增即失败）；`test=0`；`targeted=0`。

## D6 冻结 H 与证据落盘

```bash
# 按路径显式 add（绝不 git add -A / git add .）
git add <D3 解决的 14 个文件>          # 冲突文件
git add <上游新增文件的路径>            # 合并带入的 A 状态文件（用 git status -s 判定）
git status --short                     # 人工过一遍，确认没有意外条目
git commit --no-verify -m "merge: integrate upstream/main (5e9b997, 27 commits) into personal"
```

提交信息须包含上游 hash 与提交数；不使用 `-a`。

```bash
H=$(git rev-parse HEAD); echo "$H" | tee "$EV/evidence/H.txt"
git rev-parse "$H^{tree}" | tee "$EV/evidence/H-tree.txt"
git log --oneline -1 | tee "$EV/evidence/merge-commit.txt"
git show --stat --oneline "$H" | head -40 | tee "$EV/evidence/merge-stat.txt"
git log --oneline "$H^1..$H^2" | wc -l        # 期望 27
git diff --diff-filter=D --name-only "$H^1..$H"   # 期望空
sha256sum .pi/agents/trellis-check.md .pi/agents/trellis-implement.md \
          .pi/agents/trellis-research.md | tee "$EV/evidence/user-agents-after.sha256"
diff "$EV/evidence/user-agents-before.sha256" "$EV/evidence/user-agents-after.sha256"   # 期望空
git status --short | tee "$EV/evidence/status-after.txt"
```

## D7 写 `research/merge-execution.md`

必须包含：BASE/TARGET/H 与树 hash；27 提交可达证明；14 个冲突文件逐项「解决决定 + 一句依据」；
§4 语义复核逐项结论；D5 全部退出码与 lint 前后比对结论；`--diff-filter=D` 空证明；
用户资产 SHA-256 前后一致证明；偏差与遗留（如未跑 e2e 及原因）。

## 边界（本子任务不做）

不 build、不 pack、不 publish、不 push、不改版本号、不动 `.pi/agents/*` 内容、不修 lint 历史噪声。
`H` 冻结后本子任务即完成；构建与发布由 `09-19-release-build-publish-095` 承接。
