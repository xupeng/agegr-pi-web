# 实施工作区与验证基线

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

日期：2026-10-06。用户已明确批准最新版实施摘要；任务in_progress，未授权生产部署或修改真实用户配置。

## 所有权与依赖

- 原checkout：`/home/xupeng/dev/personal/forked/agegr-pi-web`，仍为通知中心分支；没有切分支、stash、复制其未提交产品代码或合入本任务。
- candidate：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`，分支`feat/subagent-model-selection`。
- 已确认提交基线：`e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`。本地main落后，未移动main；以当前checkout已提交HEAD建立独立worktree，不采用通知中心WIP。
- baseline：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection-baseline`，同提交detached worktree。仅用于保持并发candidate修改期间的只读基线。
- candidate已执行`npm ci --include=dev`，906包；baseline的node_modules链接到这棵相同依赖树，未复制依赖。两份lock字节比较一致，SHA-256：`18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`。
- Node `v24.21.0`，npm `11.19.0`，四个Pi pins为1.0.0。npm-ci.log保存安装输出；npm报告既有17条依赖漏洞，本任务不执行audit fix或改lock。

## 初次验证与环境归因

初次在candidate未改产品代码时验证：tsc/lint退出0；npm test共2853、2829通过、24失败。失败记录在baseline-tests.log，不删除或冒充通过。

初次虽隔离HOME/PI_CODING_AGENT_DIR，TMPDIR仍在真实`/home/xupeng/.cache/pi-tmp/<session>`下，SDK祖先项目资源发现受真实用户目录的`.pi`影响；继承的`XDG_STATE_HOME=/home/xupeng/.local/state`也影响既有skill-lock路径测试。随后完全隔离祖先路径及HOME/XDG，未修改这些产品代码或测试，24项全部恢复通过。

wrapper检查：pi-tmp-run只接受当前Path.home/.cache/pi-tmp内的TMPDIR；直接设置TMPDIR=/var/tmp不会建立预期隔离。因此仅为小型运行fixture用mktemp在磁盘支持的`/var/tmp`创建唯一validation HOME，再以该HOME调用wrapper，让wrapper在它的.cache/pi-tmp下创建、加锁、收尾。内层继续使用PI_TASK_TMPDIR/home和对应agentDir；测试使用tmpdir API，不硬编码fixture目录。外层finally清理唯一owned HOME；源码/依赖/worktree不放那里。

运行形状（candidate最终验证复用同策略）：

```sh
SANDBOX_HOME=$(mktemp -d --tmpdir=/var/tmp pi-subagent-validation-home.XXXXXXXX)
trap 'rm -rf -- "$SANDBOX_HOME"' EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME \
  HOME="$SANDBOX_HOME" TMPDIR="$SANDBOX_HOME/.cache/pi-tmp" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run subagent-clean-baseline -- bash -c '
    export HOME="$PI_TASK_TMPDIR/home"
    export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
    export XDG_CACHE_HOME="$PI_TASK_TMPDIR/cache"
    mkdir -p "$PI_CODING_AGENT_DIR" "$XDG_CACHE_HOME"
    # tsc / lint / npm test; logs stored in formal task research
  '
```

## 干净基线实测

| 命令 | 实测 |
| --- | --- |
| node_modules/.bin/tsc --noEmit | 退出0 |
| npm run lint | 退出0 |
| node_modules/.bin/eslint . -f json | 698文件、0error、0warning |
| npm test | 2853 tests，2853 pass，0fail/skip/cancel/todo，退出0 |

正式证据：baseline-clean-tsc.log、baseline-clean-lint.log、baseline-clean-tests.log、baseline-eslint.json。Node的既有MODULE_TYPELESS_PACKAGE_JSON运行警告未通过修改package.json消除；与ESLint warning计数区分。

这些是修复前基线，不是本任务新功能通过证据。SDK门禁另记录sdk-gates.md；产品runtime/browser验收待接线完成。

## 收尾责任

- 外层/内层独立validation HOME在本轮已清理，没有保留测试服务。
- 初次失败wrapper目录`/home/xupeng/.cache/pi-tmp/01a110da-890c-7540-97bf-c40855852c91/subagent-baseline-v8he74n2`的正式日志已保存；主代理已仅删除此owned目录（23MiB），未清其他会话缓存。
- baseline已核对clean、detached且HEAD精确e0ad630后通过`git worktree remove`移除，不含唯一数据；candidate及其唯一源码/lock一致依赖树仍在正式磁盘路径保留，最终交付后按明确收尾安排处理，不放自动清理缓存。
