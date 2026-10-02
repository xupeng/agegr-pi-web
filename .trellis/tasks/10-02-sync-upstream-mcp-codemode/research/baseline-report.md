# 独立基线：personal@93e63e8

## 来源与隔离

- 执行者：独立 general-purpose 子代理 `01a0fa87-8bef-77da-bce5-e78189f9b33f`。
- worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-baseline-20261002`。
- detached HEAD：`93e63e873481aea761cb2b2072c8a2da1654dc73`。
- 完整依赖来自本目录 `npm ci --include=dev`，没有复用其他 worktree 的 node_modules；初始/最终源码状态干净，未修改锁文件。
- 环境 Node `v24.21.0`、npm `11.19.0`、TypeScript `5.9.3`、ESLint `9.39.4`、Next/config `16.3.6`、嵌套 react-hooks `7.0.1`，四个 Pi 依赖均 `0.99.1`。
- package-lock SHA-256：`30847e0954942c0f197f1bd7e998081edd420735d0cc2dc5e78c247a92699cb9`。

## 最终门禁

| 命令 | 退出码 | 实测 | 耗时 |
| --- | --- | --- | --- |
| `npm ci --include=dev` | 0 | 同锁文件完整安装，912 packages | 38s |
| `node_modules/.bin/tsc --noEmit` | 0 | 无诊断 | 27s |
| `npm run lint` | 0 | 通过 | 60s |
| `node_modules/.bin/eslint . -f json` | 0 | 565 文件，0 error / 0 warning | 41s |
| 隔离 `npm test` | 0 | 1755 tests / 1755 pass / 0 fail / 0 skipped；10 suites，0 cancelled/todo | 159s |

单测 runner duration：`156606.862295ms`。类型/lint 未在最后单测后重复运行，其间源码和依赖未变。

单测最终运行形态：

```bash
env -i PATH="$PATH" LANG="$LANG" NODE_ENV=production \
  HOME="<mktemp>/home" TMPDIR="<mktemp>/tmp" \
  PI_CODING_AGENT_DIR="<mktemp>/agent" npm test
```

fixture 根在 `/tmp/pi-web-baseline-test-XXXXXXXX`，结束后清理。实际核实 SDK `getAgentDir()` 与 `homedir()` 都指向隔离目录；没有继承真实凭证/MCP/代理环境。仅使用套件 mocks、faux provider 与 loopback fixture listener，没有运行应用 dev/browser 或真实模型/API/MCP。

## 保留的失败及归因

1. 环境 `NODE_ENV=production` 下裸 `npm ci` 退出 0，但省略 devDependencies；第一次 tsc/lint/eslint 都退出 127。随后 `--include=dev` 完整安装。不能把首次缺工具结果当源码失败。
2. 第一次隔离全量单测退出 1：1755 tests / 1750 pass / 5 fail，132s。
   - 4 条 plugin-update 用例被全局 `PI_OFFLINE=1` 提前拒绝，没有到达 mocked command。
   - 1 条 clean-project trust 用例受 `/home/xupeng/.agents/skills` 祖先扫描影响；隔离 HOME 后这不再是 SDK 豁免的用户资源。
3. 最终轮使用 `/tmp` fixture root、不设全局 offline，保持源码不变，1755 全通过。

真实 HOME 的 `.npmrc`、agent settings/auth/models/MCP 配置前后摘要一致。没有用降低断言或改源码换取通过。

## 完整日志位置

独立基线目录中的 `test-results/baseline/`：

- `baseline-final-summary.json`（最终摘要，取代旧 blocked 状态）
- `commands.tsv`
- `npm-ci.log`、`npm-ci-include-dev.log`
- `tsc-full.log`、`lint-full.log`、`eslint-full.json`
- `npm-test-isolated-final.log`、`npm-test-isolated.log`
- `test-isolation-final-check.json`
- `main-home-config-before.json`、`main-home-config-after-final.json`
- `dependency-and-lint-summary.json`、`npm-ls-all.json`

这些是本机可审计的 generated logs，本报告随任务提交；不把含完整环境或配置摘要的原始日志批量纳入仓库。

## 限制

本基线没有浏览器/e2e、真实 Safari/Windows 或 paid provider 验证。安装报告有 3 项既有 advisories（1 low / 1 moderate / 1 high）与 install-script approval warning；未运行 audit fix 或批准无关安装脚本。
