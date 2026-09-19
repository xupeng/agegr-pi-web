# npm 下一补丁发布

> **当前状态（独立 check 完成）**：用户已批准隔离 build、同 tgz public/latest 0.9.3 发布、成功后本地 commit，以及两项必要字体许可补充。新私有 npm ci 重建、审计、生产 smoke、publish dry-run 均完成，ready-to-publish；尚未真实 publish/commit。唯一有效 tgz 与 hash 见 [check-report](research/check-report.md)。旧 pnpm 包已 superseded。下文 planning/旧阻塞段落仅作历史，不能覆盖最新批准与检查结论；历史共享 store 无污染不可回溯证明。

## 目标与价值
将已验收源码作为可安装的 `@xup3ng/pi-web@0.9.3` 发布到 npm public/latest，保证实际发布产物与验证产物一致、不污染正在开发/运行的实例。本任务保持 planning，创建任务不等于发布授权。

## 已确认背景
- 固定基线 `8ad6e95d1f2755a9094f68943b2081b62e65f8b0`，本地包及npm latest=0.9.2；本轮 exact 0.9.3 查询 E404，仅为候选可用证据。
- 主三个 `.pi/agents/trellis-{check,implement,research}.md` 属用户未提交修改。
- 真实 build 是 `next build --webpack`，现有配置不是 Next standalone；CLI 依赖预构建 .next + 生产依赖并运行 next start。
- 当前 npm whoami=E401；字体再分发许可材料未证实，均阻塞真实发布。
- 证据、锁文件/打包/配置/脚本审计和历史测试来源见 `research/release-plan.md`。

## 要求
R1 源码从精确提交导出（推荐）或批准的独立worktree获取，排除主脏文件；独立依赖、.next、HOME/XDG/agent数据/fixture项目，不碰现有服务。
R2 版本仅显式变为0.9.3，package及npm lock两处根版本同步，依赖图和pnpm lock保持不变；版本占用或基线漂移停止，不自动换版本。
R3 仅最终审批后的隔离发布目录使用既有 `TURBOPACK= npm run build`，绝不在主dev目录build；新instructions若绝对禁止则停止，不绕过。
R4 先完成许可证、pack dryrun、实际tgz逐项审计和安装生产runtime smoke，再对同一冻结tgz publish dryrun及真实publish。保证name/version/files/license、无凭据/真实数据/主路径；历史dev测试不代替发布build/产物测试。
R5 publish明确 public/latest/npmjs，不可逆、同版本不可重发；用户自己处理认证/2FA，不读取输出任何凭据、不改全局auth。回执/歧义结果先核验，不重复publish。
R6 有界验证exact版本、远端tarball内容/integrity与本地一致及latest。成功/失败/未知状态均如实记录。
R7 本地commit已获批准：先发布核验成功，后仅允许package.json/package-lock.json、public/fonts/LICENSE-cascadia-code.txt、public/fonts/NOTICE.txt 与逐文件审核的任务记录；主用户agent修改完整保留。未批准commit不移回主版本；commit失败不重发。无push/tag。

## 验收标准
- AC1（R1/R3）：记录源码H、环境边界和主用户文件前后hash，主依赖/.next/数据/服务未被发布操作修改。
- AC2（R2）：只有三处0.9.2→0.9.3元数据差异，ci锁图不漂移；产物版本含UI版本正确。
- AC3（R4）：许可证完整性门通过，唯一tarball清单/SHA256/SHA512证据、pack及publish dryrun退出0，生产安装/CLI/页面静态资源/fixture API/Trellis和终端基础smoke通过。
- AC4（R5/R6）：脱敏回执、exact=0.9.3、latest=0.9.3和下载tarball SRI一致；传播等待最多10分钟，超时记录待核验而非自动重发。
- AC5（R7）：若批准commit，仅批准文件进入提交且三用户agent逐字/模式保留；否则记录未提交状态。无自动升级真实安装/重启/远端Git操作。

## 范围外
业务修复/依赖升级、全局认证变更、changelog/GitHub Release、push/tag、真实安装升级、服务restart、旧任务归档、发布worktree创建（本轮研究阶段）。必要许可证修复若需变更源码，另行审批基线，不自行纳入本次纯版本范围。

## 决策与阻塞
建议审批：精确H导出、隔离安装和发布build、审计同一tgz后不可逆public publish；本地commit可选且需明确包含主package更新可能触发HMR。npm E401需用户交互解决；字体许可需可信来源证明，若需新增文件则重新定界。既有14 lint errors不是通过；历史E2E一次全过不抹除间歇失败，拟复用源码证据，不豁免产物测试。

## 规划收敛状态
需求/验收/设计/执行手册及真实JSONL上下文已具备；用户意图没有额外功能歧义。技术阻塞显式保留，不宣称release-ready。当前仅请求最终范围审批与可选commit决定；未批准实施，未运行task.py start。审批不能豁免技术门或自动授权范围外修复。

## 用户批准与执行状态追加（2026-09-13，最新优先）

> 以下为追加记录，旧 planning 描述保留为历史。

- **用户已批准最终规划**：独立目录 build/审计/安装 smoke、npm public/latest `0.9.3`、
  成功后可选本地 commit；并明确批准核实缺失字体许可、补必要版权/许可/打包文件，
  **不改字体或业务**。主 task 已 start。
- **认证阻塞已解除**：用户在本机完成 npm 登录，只读复核 `npm whoami` = `xup3ng`。
  历史 “npm E401” 为已解决的历史状态；真实 publish 的 2FA 是否就绪仍未证实。
- **字体许可阻塞已解除**：Cascadia Code woff2 二进制与 `@fontsource/cascadia-code@5.3.0`
  latin 子集逐字节一致，许可为 SIL OFL 1.1（Copyright (c) 2019 - Present, Microsoft
  Corporation, with Reserved Font Name Cascadia Code）。已在隔离源码新增
  `public/fonts/LICENSE-cascadia-code.txt` 与 `NOTICE.txt`。证据见
  `research/license-fonts.md`。因此 “字体许可材料未证实，publish 阻塞” 的历史描述被取代。
- **范围更新**：“不创建发布目录/worktree（研究阶段）” 被取代——已创建独立隔离目录
  `/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913`。
- **本委派实际完成（preparation-only）**：源码导出、许可补丁、版本 bump、隔离 build、
  dry/real pack 审计与封存 tgz、生产安装 + loopback runtime smoke。详见
  `research/preparation-report.md`。
- **未执行**：真实 publish（含 publish dry-run 之外的任何上传）、commit、push/tag、
  升级真实安装、重启服务。这些留给主会话在独立 check 与认证确认之后执行。
