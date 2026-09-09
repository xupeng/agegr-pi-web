# 执行计划

1. 获得最终规划批准，加载 trellis-before-dev，启动任务。
2. 确认 Git 状态及远程，检查 fork 差异与上游改动，合并 a26cc68。
3. 逐项解决冲突及语义重叠，维护 fork 元数据、个人功能、依赖锁文件。
4. 版本更新为 0.9.2；执行 npm test、npm run lint、node_modules/.bin/tsc --noEmit，修复新增问题。
5. 加载 trellis-check 进行复核。在隔离目录 npm ci、npm run build、npm pack --dry-run，检查原生终端依赖与发布文件。
6. 安装实际 tarball，隔离端口及数据完成启动/API 冒烟；条件允许时执行上游隔离 E2E。
7. 确认 npm 未占用版本、凭据有效，提交并推送 origin/personal，发布已验证的 tarball（public/latest）。
8. npm view 核验版本及 dist-tag，记录发布结果及验证证据，收尾任务。

风险检查：不在当前 checkout 执行 next build；不覆盖现有运行服务或真实会话数据；npm 认证阻塞时请求用户操作；不创建与上游 v0.9.0 混淆的标签。
