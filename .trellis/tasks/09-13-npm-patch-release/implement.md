# 审批后执行清单（2026-09-13 check完成，真实publish/commit未执行）

> **最新优先**：新 `src-ci` 私有 npm ci/build、final tgz 审计、生产安装/Trellis envelope+桌面手机UI/terminal smoke、publish dry-run、hash/用户文件复核均完成，见 `research/check-report.md`。旧 pnpm tgz 已 superseded，不得发布；下面编号项原准备阶段描述保留为历史。未来 commit 必须含两 package 文件和 `public/fonts/LICENSE-cascadia-code.txt`、`public/fonts/NOTICE.txt`，再加逐文件审核任务记录。unit 1222 pass（保留 XDG_STATE_HOME 测试假设失败记录），tsc pass；新 npm lint exit0 不代表历史 pnpm 14 errors 修复。

完整命令、边界、允许文件和异常处理以research/release-plan.md为准。本文件现记录实际执行状态。
状态标记：`[x]` 已完成，`[~]` 部分/有偏差地完成，`[ ]` 未执行。

1. [x] 收到最新规划范围明确批准，记录是否允许本地commit及主package更新的HMR影响；按适用Trellis流程加载before-dev，技术门不因审批豁免。
   - 用户已批准含本地 commit 与必要许可文件扩围（见 prd.md 追加记录）。已加载 JSONL/prd/design/implement/research。
2. [x] 核查新instructions；只允许独立发布build，主dev build禁令始终有效。npm E401由用户交互解决，不改全局认证；字体许可只读补证，需改文件则另行批准新基线，停止当前纯版本发布。
   - 认证：用户已登录，`npm whoami`=xup3ng。字体许可：用户明确批准补必要许可文件，已在隔离目录补齐（`research/license-fonts.md`）。
3. [x] 重新确认HEAD=8ad6e95d1f2755a9094f68943b2081b62e65f8b0、index/status/三agent hash；explicit npmjs exact0.9.3未占用，latest仍0.9.2，身份及scoped registry正确。
   - 全部核对通过；见 `research/preparation-report.md` 第7、8节。
4. [x] 创建全新隔离目录并git archive精确H，独立源码/依赖/.next/cache/HOME/XDG/agentDir/fixture项目。允许列表env，不复制主node_modules、auth或数据。
   - 隔离根 `/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913`。因磁盘仅约0.4GB，build依赖用 pnpm 全局 store 硬链接（frozen/offline），smoke 用 tmpfs；均为已记录偏差。
5. [x] `npm version 0.9.3 --no-git-tag-version --ignore-scripts`；审查package及npm lock仅三处根version变动，pnpm和依赖图不变；记录源patch/hash。
   - 仅三处 0.9.2→0.9.3；pnpm-lock 不变；patch sha256 `a9496e32…`。
6. [~] 私有npm ci；安装/原生postinstall/Node环境留证，失败不regen lock。按需npm test、tsc --noEmit --incremental false及lint逐诊断对照历史14，不声称lint绿。
   - 磁盘不足，改用 pnpm frozen/offline 硬链接安装（exit 0，锁未改）。本委派专注发布产物验证，未重跑 unit/tsc/lint；历史源码证据见 revalidation-report，lint 仍为 14 errors 未通过（限制保留）。
7. [x] **仅隔离目录** `TURBOPACK= npm run build`；构建成功并检验0.9.3版本嵌入、Next production manifests/server/static，禁止在主checkout执行。
   - 仅隔离 `src/` 执行；exit 0；BUILD_ID `HpNoCyvhTfX8JSrIk0BmZ`；版本嵌入已验证。首次 ENOSPC 因 webpack cache 写满磁盘被监控中止；重跑仅将 `.next/cache` 指向 tmpfs，未改配置。
8. [x] `npm pack --dry-run --json --ignore-scripts`，再生成唯一tgz并审计name/version/files/bin/LICENSE/第三方声明、秘密/主路径/归档安全；保存SHA256/SHA512 SRI。打包缺件/许可证不完整停止。
   - dry-run 与 real pack integrity 一致；审计通过；tgz 已封存（sv/sha/SRI 见 preparation-report 第5节）。
9. [x] 第二私有prefix安装同一tgz，仅生产依赖；CLI help/start --no-open、独立loopback端口、首页静态资源/版本、fixture API/Trellis和terminal基础smoke。保留证据，只清理自己的进程，不升级全局真实安装。
   - 真实 `npm install <tgz> --omit=dev`（tmpfs）361 包；CLI/首页/项目/会话/字体/许可/静态/版本/node-pty/终端 SSE 全部通过；只清理自身进程，端口已释放。未做 publish dryrun（见第10步）。
10. [ ] 对同一tgz显式npmjs scoped registry/public/latest执行publish dryrun且退出0，复核hash；这不是认证/2FA成功证明。
    - 本委派要求“不 publish”，故未执行 publish dryrun；留待独立 check/主会话。
11. [ ] 用户终端处理2FA，对同一tgz单次真实publish；保存脱敏回执。错误/中断先判明远端是否上传，不自动重试。
12. [ ] 总预算10分钟、每请求20秒/0重试、最多30轮10秒间隔核验exact、dist.tarball/integrity和latest；下载比对本地tgz。超时/矛盾保留published-unverified，不重发/不移动tag。
13. [~] 写research/release-result.md：源码H/版本patch、锁hash、环境、build/pack/runtime结果、tgz hash、回执、远端核验、当前Git与可选commit状态。日志不得带auth/真实数据。
    - 本委派以 `research/preparation-report.md` + `evidence/evidence.json` 记录准备阶段全部证据；`release-result.md` 待真实 publish 后由主会话补齐回执/远端核验。
14. [ ] 仅若用户批准commit且远端已验证：HEAD/index/允许文件未漂移，精确同步两package版本；按手册逐文件git add并审查cached diff，确认无三agent/生成产物/其他用户内容。普通commit后记录SHA并核验用户hash不变；失败保留发布事实，不重新publish。无push/tag。
15. [~] 若不批准commit或发布未核验，不同步主package；报告待办/阻塞。收尾不restart服务、不归档旧任务、不删除既有worktree。
    - 主 package 未同步（仍 0.9.2）；未 restart/未归档/未删除既有目录。

## 风险文件和恢复点

package.json与package-lock.json是仅有候选版本修改；批准新增public/fonts/LICENSE-cascadia-code.txt和public/fonts/NOTICE.txt，提交allowlist不得漏掉；pnpm-lock默认零改动。next.config.ts、scripts/release-npm.sh、bin及业务代码只读。三个用户agent不可碰。未经publish的隔离目录可保留供诊断，不用git reset/stash。已经publish不能回退：新修复版本、dist-tag操作、unpublish均另议。
