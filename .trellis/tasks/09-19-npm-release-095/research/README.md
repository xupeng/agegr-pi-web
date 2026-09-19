# 上游合并分析索引（0.9.5 前置）

本任务的合并前置分析由 `trellis-research` 子代理产出，落盘在合并任务的 research 目录：

- **[../09-19-merge-upstream-pre-095/research/upstream-merge-analysis.md](../09-19-merge-upstream-pre-095/research/upstream-merge-analysis.md)**

内容概要：

1. `upstream/main` 相对 `personal` 的 27 个提交清单（任务书写的 20 个已过时，fetch 后上游前进 7 个）。
2. 依赖/配置漂移结论：27 个提交**未改** `package.json` / 锁文件 / next / eslint / tsconfig / `.github`，本次合并**无需**依赖或锁同步。
3. 隔离 worktree 实测冲突：27 提交 → 14 个冲突文件（20 提交 → 12 个）；无删除、无 add/add、无 `package.json` 冲突。
4. fork 资产（`@xup3ng/pi-web`、`bin/pi-web.js`、`public/fonts` 许可与 NOTICE、中文文案、`.trellis`、`.pi`）风险逐项评估；`.pi/agents/trellis-*.md` 未提交修改不受影响。
5. 上游新增 9 单测 + 2 e2e，及合并后的验证命令矩阵与历史 lint 噪声。
6. 风险清单、解冲突顺序建议、回滚方案与完整原始证据。

对 0.9.5 发布的影响：合并完成后即以合并提交为发布基线；`public/fonts.test.mjs` 与 `tar -tzf` 许可断言按 `09-19-font-license-in-next-release` 执行。
