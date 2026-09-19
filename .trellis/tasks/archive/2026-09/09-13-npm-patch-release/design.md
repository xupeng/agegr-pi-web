# 发布设计

> 当前批准与结果：必要两字体许可文件已获批准，与三处版本元数据一并作为 H 上的四文件补丁，无业务/锁图变更。已用新私有 npm ci 在 `src-ci` 重建并完成同新 tgz 的审计/生产 smoke/publish dry-run；旧 pnpm 硬链接候选作废保留。真实 publish/commit 未执行；完整结果和未来四文件 commit allowlist 见 `research/check-report.md`。

## 边界与数据流
精确已提交 H → 独立git archive源码 → 显式版本patch → 私有npm ci → 项目既有发布build → pack dryrun → 唯一tgz → 第二独立生产安装/smoke → 同一tgz publish dryrun → 用户交互public publish → registry exact/tarball/latest验证 → 可选本地允许文件commit。

主checkout只读，除未来已批准且发布核验成功后的两package版本同步、两新增public/fonts许可文件与任务文档；三个用户agent文件永不写入/暂存/打包。build、依赖、真实用户HOME/数据永不交叉。导出优于linked worktree：避免误打脏文件、Git根解析连接真实项目；仍用独立fixture项目验证。

## 产物与兼容性
既有Next配置未启用standalone，不改变架构。bin启动生产next start，需要.next/server/static/manifests、public及生产依赖。npm files白名单不是秘密扫描替代品。当前外部SDK/node-pty和动态next配置解析必须以生产依赖实际安装证明可用。无新增schema、SDK或Node engine变更；平台局限记录为Linux测试而非跨平台保证。

## 操作设计与取舍
不使用release-npm.sh或npm run release一键流程：它们无法锁定审计tgz，且有自动commit/吞dryrun错误等限制。拆分操作但保持原build脚本，不修脚本/业务。无prepack可用ignore-scripts pack/publish，安装仍保留所需postinstall。npm registry/scoped registry/access/tag全部显式锁定；认证只在用户终端，构建smoke无凭据。

首选H导出而非新worktree；版本与hash建立发布前追溯，不为发布提前commit。可选commit在远端成功核验之后，与fork文档一致；主更新package可能触发HMR，须随commit选项审批，绝不restart。提交只接受空index、HEAD未漂移和精确允许文件。细化协议/命令/状态见research/release-plan.md。

## 失败状态机
planned → blocked/auth-license → prepared → built → audited → smoke-passed → publish-attempted → published-unverified → verified → optionally-committed。
任何publish前失败停止，无主版本同步。publish可能上传则先查询，不按退出码盲重试。有成功回执/同版本可见即禁止重发；传播10分钟预算耗尽保留待核验。远端成功commit失败只是本地待办，不撤销已发布事实。回滚仅限未发布隔离候选；npm发布无安全自动回滚，同版本不能再用。许可证需源码修复或版本被占用则重新审批，不擅改范围。

## 证据复用
H与已验证tree只有旧任务文档差异，复用1222unit/tsc/Trellis两轮/原E2E当次完整通过作为源码证据，保留14 lint和历史时序/环境限制。发布build/实际包内容/生产runtime必须新验，不用dev E2E替代。
