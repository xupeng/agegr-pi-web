# 验证记录（2026-10-03）

## 被检对象与交付状态

- BASE `8d376f3b1b98adf91f2ae651a7188745b1f563fd`，TARGET `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`。
- 候选 worktree `agegr-pi-web-worktrees/upstream-sync-20261003`，分支 `merge/upstream-20261003`。
- 用户确认五批本地提交方案后，已逐路径审计并暂存160个产品路径，形成非快进合并 `18a284d1c4481a8e79fa441f5448129ee8d6f704`；父提交精确为 BASE 与 TARGET，`git merge-base --is-ancestor TARGET HEAD` 成功，上游独有提交数47，无未合并 index 条目。spec 提交为 `b9c5bcb1a5d8428428dfd29f70351d688b77a7f2`。
- 冻结工作提交 H=`18a284d1c4481a8e79fa441f5448129ee8d6f704`。后续仅 task/spec/归档/日志元数据，不改被检产品树；最终任务分支 HEAD 在会话交付中报告。
- 主 checkout 的 personal 仍为 BASE，只存在任务规划目录；未修改/重启其开发服务，未发布、push、创建 PR。

## 干净依赖树与最终门禁

基线与候选均在独立普通磁盘 worktree `npm ci --include=dev`，没有复用主 checkout node_modules。
Node `v24.21.0`、npm `11.19.0`、TypeScript `5.9.3`、ESLint `9.39.4`、Next/config `16.3.6`、react-hooks `7.0.1`。

| 检查 | BASE 实测 | 最终候选实测 |
| --- | --- | --- |
| npm ci --include=dev | exit 0，912 packages | exit 0，906 packages |
| tsc --noEmit | exit 0 | exit 0 |
| npm run lint | exit 0 | exit 0 |
| eslint JSON | 632 files，0 error/0 warning | 704 files，0 error/0 warning |
| npm test | 2134/2134，exit 0 | 2757/2757，exit 0，无 skipped/cancelled |
| npm run test:e2e | 本轮未跑 BASE 浏览器基线 | 完整 run.mjs + subagents.mjs exit 0 |
| Settings MCP 独立浏览器 smoke | 不存在新增功能 | 1280px/390px exit 0 |

lint 新增 72 个目标来自上游新增源码/测试；规则和 compiler 门禁未降低。最终测试比 BASE 多 623 条，包含上游与合并专用回归。不要把旧全测 2752/2752 或中途 2756/2757 的结果当最终证据。

最终 Node 环境：

```text
HOME=/var/tmp/pi-web-sync-accept-home.3CwR8P
PI_CODING_AGENT_DIR=$HOME/.pi/agent
TMPDIR=/var/tmp/pi-web-sync-accept-fixtures.AtFqpS
unset XDG_STATE_HOME XDG_CACHE_HOME XDG_CONFIG_HOME XDG_DATA_HOME
node_modules/.bin/tsc --noEmit
npm run lint
npm test
```

本机日志（候选 worktree 的同级普通磁盘目录）：

- `upstream-sync-baseline-clean-test-20261003.log`：2134/2134。
- `upstream-sync-baseline-eslint-20261003.json`：632/0/0。
- `upstream-sync-accept-{tsc,lint,test}-20261003.log`：最终三个 exit 0，2757/2757。
- `upstream-sync-final-eslint-20261003.json`：704/0/0。
- 完整 Chromium 与设置截图/日志见 `browser-verification.md`。

## 包、锁与用户资产

- root manifest、lock root 与 installed metadata 均为 `@xup3ng/pi-web@0.12.0`；package.json 对 BASE 的差异仅四个 Pi pins。
- 四个 direct/lock/installed SDK 为 exact `1.0.0`；portable 两 peers 与 discovery 断言同为 1.0.0。
- lock 冲突仅 root 身份两块；逐块保留 fork 身份与上游解析结果，干净 npm ci 验证成功，未手写依赖解析版本。
- BASE→候选无 tracked 删除；`.pi/agents` 无差异，主 checkout 用户配置、工作树和现有服务未被任务修改。
- next.config.ts / tsconfig.json / eslint.config.mjs / .github 无最终差异。浏览器 dev 的 tsconfig 生成行未纳入交付；未运行 next build。
- npm audit 安装摘要：两边均 8 vulnerabilities（1 low/1 moderate/6 high）；本任务不做额外依赖审计/修复，不能据总数相同宣称漏洞集合完全相同。

## 冲突/复核决策

- ChatInput/ChatWindow/MessageView/useAgentSession：保留 configured、ask、Trellis ownership、文件 options、mobile Enter 与 minimap；加入上游 MCP slash、工具描述及普通 Code mode 输入框。
- SettingsPanel/navigation：MCP 与 AppendSystem 共存，不误变 project-only；保留 visited sections、fork General 字号/内容宽度、移动全屏/header safe-area。
- 三语：每语 1407 keys，fork 的 105 和上游的 548 新 key 均保留，重复/占位符一致性测试通过。
- AGENTS/docs：保留 fork 强制约束，吸收主题拆分；补 top-level Trellis structured-only result、ask navigation carry、exact successful file evidence 三个窄例外及 activity 排序，避免上游规则与 fork 相反。
- 自动合并 rpc-manager/builtin-extensions/资源工厂/授权/wire 等由独立只读复核；证据与边界见 `independent-review.md`，聚焦 72/72 通过。
- F1 已修：AppendSystem trust key 驱动元数据刷新，draft/baseline 不动；cleanup abort + cancelled 拒绝旧 cwd/trust/unmount 响应。实际 effect 回归与 Settings prop 回归 30/30 通过；独立 trellis-check 无阻塞发现，浏览器两种宽度实际确认草稿保留。

## 验证中发现的问题与处理

1. `/tmp` 用户配额 EDQUOT：npm test 启动前 abort 134，非源码错误。使用普通磁盘 `/var/tmp`，HOME/TMPDIR 独立；不删除用户临时文件。
2. 测试环境初次继承 XDG_STATE_HOME 导致 skill-lock 路径偏移、TMPDIR 放 HOME 内导致路径 `~` 展示；清除 XDG 并拆开两个目录后 BASE 全绿，不修改产品迎合环境。
3. ChatInput 上游 AST callback mock 缺 fork `hasPendingImages`：补 false，保留产品图片保护和上游所有断言。
4. 新 hook/stacked-dialog 测试直接 Node import 无法解析 fork appearance alias：复用 alias-aware Jiti，未改产品依赖边界。
5. 上游 trust route 断言 agent 目录只能有 mcp.json 与 fork disk session cache 相冲突：只允许已知 `pi-web-session-list-cache.json`，仍严格拒绝其他文件/凭证/锁/trust 写入。
6. Trust safe-area 用例期待 Settings backdrop 同步 padding，与 fork 全屏 header inset 契约相反：改为 Trust/config-only fallback 并保留 portrait/landscape fallback 断言。
7. 老 e2e script 高亮盒已被批准的上游普通 tool input 替代：改 first pre，保留每个脚本字节、嵌套 call、输出 header 排除和真实 fontsize setter；完整门禁复跑通过。
8. 全测并发浏览器时暴露 crashing MCP 的时序断言：其默认 script exposure 按新合同不在 prompt前等待，不能从模型 completion 推断后台连接已失败。用已有 bounded waitFor 观察两个 server 的 failed，再断言相同完整 stderr/error/masking；定向10/10和最终2757/2757通过，不增加固定 sleep或改变运行时。
9. 真浏览器启动中 tsc 读取生成到一半的 Next validator 一次失败；测试服务停止并排除 generated include 后最终 tsc 0，不改 compiler 选项掩盖错误。
10. 显式暂存后 `git diff --cached --check` 发现上游三个 importer 文件多余 EOF 空行；只各移除一个 LF。用已暂存原始 bytes 与工作树 bytes 比较确认 `old[:-1] == new`，不改变任何源码 token/行为，复用刚完成的门禁证据。再次 cached check=0 后才形成合并提交。

## 残余风险

- SDK 真实构造/worker/portable发现、直接 ask terminate、model-only拒绝、wrapper lifecycle/MCP trust/Test/OAuth 等由本地真实SDK+faux/local fixtures覆盖；未向真实模型或第三方OAuth服务发送请求。
- Chromium desktop/mobile/tablet 已实际运行；Safari 16.2、Windows 真机、每一种 MCP管理表单的浏览器组合未覆盖。
- 非阻塞观察：元数据刷新若先失败后成功，footer 旧错误可能留到下一次保存清除；不影响基线/草稿/信任状态。本次未重构多来源错误 ownership。
- 尚未 push/PR/合并 personal；工作提交、spec、任务产物、归档和日志必须留在同一任务分支。
