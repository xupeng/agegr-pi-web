# 集成复核 — 0.11.0 发布父任务

依据 `design.md` 的「Integration review」五条，核对两个子任务的最终状态。复核时间
2026-09-28，复核时 `personal` 工作区干净。

## 1. `personal` 的历史与 ref 一致性

| Ref | OID |
|-----|-----|
| `personal` = `origin/personal` | `91cd660` |
| 发布冻结点 `H` | `92e4cec`（tree `cbbc4dee3435a7599ddf06e0c1303e78840e00f8`） |

`personal` 上与本请求相关的提交（按时间顺序）：

1. `c477bec` Merge PR #17 —— `upstream/main@96966e5` 合入（子任务 A）
2. `92e4cec` 任务规划产物提交 = 冻结点 `H`
3. `134de42` Merge PR #18 —— 对话区对齐修复 `5ddd4e7`
4. `91cd660` Merge PR #19 —— `8891b62` `chore: bump version to 0.11.0`、`19d1de3`
   验收与审计产物、`c5770f1` 归档子任务 B、`c0eafab` 会话日志

`chore: bump version to 0.11.0` 已在 `personal` 上，且 `HEAD == origin/personal`。
`design.md` 假设上游合并之后只有 bump 提交会移动 `personal`；实际中间还合入了 PR #18，
见偏差 1。

## 2. registry 与归档包

| 检查项 | 观测值 |
|--------|--------|
| `npm view version` / `dist-tags.latest` | `0.11.0` / `0.11.0` |
| registry `time.0.11.0` | `2026-09-27T12:06:53.849Z` |
| `dist.fileCount` | 827 |
| `dist.shasum` | `db580f23b0a77b00c675dcf022d1d3157145f9ba` |
| `dist.integrity` | `sha512-51taftQ8TVbPhD3a2UA76GJuMz4JE3QVaBGyysuCUwciP5eqVJNcTJHGVA+VXViCfYKau5e6Rud926hYUgWcJA==` |
| 归档 tgz sha256 | `1c6112e18aafd5d4823a7cca79a9f06bc9a59d80069b1886a06e527c048aa1d4` |
| 归档 tgz 路径 | `/home/xupeng/pi-web-release-artifacts-0.11.0/pack/xup3ng-pi-web-0.11.0.tgz` |

本次复核重新下载了 registry 上的 `pi-web-0.11.0.tgz`，sha256 与归档包完全相同；
`tar -tzf … | wc -l` 为 827，与 `dist.fileCount` 一致。

## 3. 开发 checkout 状态

- `lsof -nP -iTCP:8505 -sTCP:LISTEN` → PID 2228435；`curl http://localhost:8505/` → 200。
- `git status --porcelain` 为空。

## 4. 子任务报告

| 子任务 | 报告 | 状态 |
|--------|------|------|
| A `09-27-sync-upstream-pre-0110` | `research/verification-baseline.md`、`conflict-decisions.md`、`upstream-delta.md` | 已归档，结论记在报告的「AC status」表 |
| B `09-27-npm-release-0110` | `research/release-report.md`、`research/artifacts/pre-publish-audit.md` | 已归档 |

- A 的 e2e 在隔离 worktree 里跑了 7 次：5 绿 2 红，且两次红色是不同断言。「历史分页
  节点数量」是测试期望问题，已修（`ed31361`）；「节点身份」7 次中出现 1 次、4 次跟进
  未复现，作为已知间歇门禁记录（`716c3a9` 加了自诊断）。
- A 的 `prd.md` 复选框未回填，其实际结论在报告的 AC 表里；本次复核不修改已归档产物。
- B 的 AC5（引用 npm publish 原始日志行）无法满足——脚本未留存调试日志，报告改用
  registry metadata 作为独立来源并标注为偏差。B 的 AC6/AC7 在 PR #19 合并后成立。

## 5. 最终集成状态（本任务 AC6）

冻结点、提交链、registry 标识、tgz sha256 与各条验证命令的观测值即上面三节；
验证命令为 `npm view @xup3ng/pi-web version dist-tags.latest dist.fileCount dist.shasum
dist.integrity`、`sha256sum` 比对、`tar -tzf | wc -l`、`lsof` 与 `curl`。

## 偏差

1. **发布产物早于 PR #18。** 冻结点 `H = 92e4cec` 在 PR #18 合并之前，因此 npm 上的
   0.11.0 不包含对话区对齐修复。证据：归档包内 `grep -c 'chat-scrollbar-gutter'` 为 0，
   而合并后的 `components/ChatInput.tsx:1844` 使用了该变量。该修复随下一个版本发布。
2. **bump 提交走 PR 而非直推。** `09-27-npm-release-0110/prd.md` 原计划把 bump 直推
   `personal`；由于脚本没有留下 bump 提交，且冻结后 `personal` 又被 PR #18 推进，
   bump 与归档改由 `release/npm-0110` 分支的 PR #19 承载。
3. **publish 原始日志缺失**（子任务 B AC5）。
4. **已归档子任务的 prd 复选框未回填**（见第 4 节）。
