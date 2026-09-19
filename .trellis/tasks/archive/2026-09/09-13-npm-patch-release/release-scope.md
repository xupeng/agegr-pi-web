# 发布范围

## 当前已批准范围与状态（最新优先）

用户已批准独立发布 build、审计同一 tgz 后 npm public/latest 0.9.3、成功核验后的本地 commit、必要两字体许可补充；无业务/依赖版本变更。独立 check 已用真正私有 npm ci 重建并完成新包 smoke 与 publish dry-run。旧 pnpm 硬链接 tgz 禁止发布。真实 publish/commit 未执行，用户可能需终端完成 2FA。

未来 commit 源码 allowlist：`package.json`、`package-lock.json`、`public/fonts/LICENSE-cascadia-code.txt`、`public/fonts/NOTICE.txt`；任务文档逐文件审核清单及最终 tgz/hash 见 `research/check-report.md`。三用户 agent、主依赖/.next、现有服务和真实数据不动，无 push/tag/restart/upgrade。

## 历史初始规划范围（已被上述批准更新）

- 用户同意新建任务规划 npm 包 `@xup3ng/pi-web` 下一补丁发布。
- 源码基线 `8ad6e95d1f2755a9094f68943b2081b62e65f8b0`，包含上游 v0.9.1 合并及已验收 Trellis 展示。
- 本次 `npm view @xup3ng/pi-web version dist-tags --json` 返回版本及 latest 均为 `0.9.2`；候选 `0.9.3`，实际发布前须再次核对。
- 主工作区三个 `.pi/agents/trellis-{check,implement,research}.md` 未提交修改属用户工作，必须保留、不暂存、不打包。
- 在独立发布目录准备产物，不污染当前开发目录 `.next`、依赖或服务；不得在 dev checkout 构建。
- 当前仅批准规划，尚未批准 bump/构建/publish/commit/push/tag。发布构建需按发布专用流程明确审批，与禁止开发期间 build 的要求区分。
- 核查脚本、认证与打包清单、版本锁文件一致性、可重复验证/发布后远端校验，可能需要用户浏览器 npm 授权。
- 不自动重启或升级正在运行的服务，不归档旧任务。
