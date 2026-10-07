# 历史验证证据留存

原 PR 34 的 280 个仓库内原始验收文件已从重建树移出，完整副本来自已独立恢复验证的原 Git 对象，位于私有目录：

`/home/xupeng/services/pi-web/history-backups/20261007-pr34/evidence/.trellis/tasks/archive/2026-10/10-06-subagent-model-selection/`

恢复 bundle 位于 `/home/xupeng/services/pi-web/history-backups/20261007-pr34/original-all-refs.bundle`，保留原 tip `c3f8aa3deb11a572e815378a1781f4397e638183`；SHA256 为 `d87e571a6a35eab97b28be335e91db7bb4d883a399b98fd94ac948fae119999e`，独立 bare 恢复、fsck 和原始 tree 比对通过。

本文档及研究 Markdown 保留原任务的历史通过、失败和未覆盖结论，不把旧测试冒充新 SHA 验收。旧 SHA/PR 引用是历史标识。真实用户会话文件未迁移或修改；离线副本不是运行依赖。
