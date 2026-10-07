# 独立 subagent model-selection browser 验收计划

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

日期：2026-10-06。Owner 仅 `e2e/subagent-model-selection.mjs`、
`e2e/fixtures/subagent-model-selection.mjs` 和本文。没有改产品代码、SDK helper、原 checkout、
依赖或锁文件；没有派生子代理、提交或推送。

## After-review fresh owner checkpoint（2026-10-06 16:43 UTC）

已用全新隔离 HOME/Next/Chromium 实跑 4 次，当前 **BLOCKED / 验收未完成**。
前 2 个完整到达 child 的运行真实验证 new/warm/resume/reload/cold（含物理 Kimi 历史不授权）
以及 read/grep/find/ls + late web_search 声明；第 3 次完成 390px 默认表单断言。
最新运行在首次 child 请求之前实际返回 gateway/fixture-gpt `auth-unavailable`，立即停止，
child0/search0/Kimi0/外部 TCP0，后续 Send/picker/旧false/全局settings终值矩阵未到达。
不得把前轮局部通过合成完整browser通过。详细请求/response/counts/cleanup见正式browser-report.md。

Next dev-only metadata 已用框架特定 fixture 在 Undici PUBLIC dispatch 精确识别 URL +
getVersionInfo caller 后本地 throw；记录 dev-only-update-suppressed，与 model/search 分列。
不放行任意非loopback；不mock产品API/SSE，不改SDK/product。两个新helper修正（SDK无参
listAll递归发现、手机真实Settings combobox）已实跑；手机backdrop关闭修正还未执行，
因为最新产品auth阻塞更早。所有证据已复制research，4个outerHOME/own进程已清理。

## Fresh-owner checkpoint（2026-10-06）

主代理已确认产品 ready；fresh owner 已完整读两个脚本、PRD/design/server-closeout/client-errors
及涉及规格。首次实际 TMPDIR 为 `/home/xupeng/.cache/pi-tmp/01a111d9-4654-7540-97bf-c48d428c2daa`，
不用于验收。8505 属于他人 PID 1118376/1118396，26812 属于已部署服务 PID 1005786/1005816；
30141 无监听，以上均不操作。唯一 worktree 分支为 `feat/subagent-model-selection`。

校正预检查：factory 只记录 process.cwd；真实 `session_start` 断言 `ctx.cwd === isolated project`。
Next 的公开 directory 参数改为临时 symlink facade（仅源码/依赖链接及两个小配置副本，不带真实
`.pi`/AGENTS/祖先资源）；保留 candidate Next 配置，仅 Turbopack root 扩宽以解析原位置源码链接。
这样默认 cwd 的目录也在完全隔离 HOME 祖先下，不改产品默认 cwd、不复制大型源码/依赖。
spawn cwd、app dir、SDK cwd、PID/PGID/端口/日志分别记录。若该合法宿主形状失败，先保留证据再校准，
不能据此修改产品或绕过 model/policy 合同。

已实跑真实 Chromium，当前 BLOCKED：合法 global absolute extension 被 inherited child 的来源
containment 再授权拒绝，`provider-source-invalid`，未跑后续 warm/cold/mobile/recovery 矩阵。
已立即报告主代理，未移动 fixture 绕过合同。精确请求/response/log/截图、所有退出码和清理见
`browser-report.md`；最后证据 `subagent-model-selection-browser-2026-10-06T15-42-52-934Z/`。
runner facade 最终为真实 route 目录 + 单文件 symlinks，两个 tracing/bundler roots 一致。
另外 Next HMR 自身 npm dist-tags 检查被 TCP guard 拦截，须在重试时合法关闭其 dev-only 路径。
下方旧 static 状态和原运行形状保留作历史，不作为当前 ready 状态。

## 初次 owner 状态：仅 static，浏览器尚未运行

- 已读本任务 PRD/design/implement、baseline/sdk-gates、质量/类型/组件/移动设置/模型默认合同、
  `docs/agents/{sessions,subagents,tools,models}.md`、现有 `e2e/subagents.mjs`、
  `e2e/ask-user-host.mjs` 与 faux fixture，以及 SDK SessionManager/faux 公共声明。
- 第一次 bash 已核对 TMPDIR（本 session 的 pi-tmp 路径）及
  `feat/subagent-model-selection` 分支。所有命令先 cd 指定 worktree。
- 用户已提供可用 Chromium：
  `/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell`（优先）；
  `/sbin/chromium` 是备选。未下载/安装浏览器或系统包。
- 脚本有 `E2E_PRODUCT_READY=1` 显式前置门禁。目前等待主代理产品接线 ready；
  **没有启动 Next/backend/Chromium，也没有宣称 browser 通过。**
- 编辑使用本机 Codex 二进制的 `--codex-run-as-apply-patch` 入口，仅执行 apply_patch，
  不创建 Codex agent/session（环境无独立 apply_patch 命令）。

## Fixture 设计及请求统计

当前隔离 `settings.json` 显式启用本 fixture 文件（绝对路径），关闭 packages 与普通
MCP/codemode/tool-search，scope 为 `gateway/**`，默认 `gateway/fixture-gpt`。
没有任何真实 API key、OAuth 或 proxy 从祖先环境传给 Next。

- Native provider 经公开 `fauxProvider` + `pi.registerProvider(providerObject)` 在 factory
  就绪；模型为 `Fixture GPT` (`gateway/fixture-gpt`) 与明确改选用的
  `Fixture replacement` (`gateway/fixture-replacement`)。
- faux response factory 使用**真实 session transcript** POST 到唯一 loopback `/model`，
  本地 backend 根据最后 user/toolResult 返回确定 Agent/search tool call 或文本。
  每轮实际 provider call 在 `fixture.jsonl` 记录，并在 backend 保存完整请求上下文。
- `web_search` 不在 factory 阶段注册：真实 `session_start` await 后注册，实际 execute
  POST loopback `/search`，返回 `LOCAL-SEARCH-RESULT:<query>`。Transcript、后续模型响应、
  backend 三侧均断言标记；reload 后重新注册。没有 sleep 猜 ready 的产品绕过。
- `openrouter/moonshotai/kimi-k2.6` 是 native faux 哨兵；一旦请求立即记数并报错。
  provider call 哨兵必须 0；TCP guard 拒绝任意非 loopback socket，并把尝试记录为失败。
  浏览器只允许 loopback route，外部请求为失败，不替换或 mock 产品 API/SSE。
  该 tripwire 只用于测试，不宣称为第三方代码沙箱。
- 历史 fixtures 使用 SDK `SessionManager.create/append*`，assistant 使用公开
  `fauxAssistantMessage` 生成完整 usage。不存在手写假 usage/jsonl session。
  初始失效 child 选择 `gateway/retired-gpt`，物理 Kimi assistant 只是旧历史；旧 false
  child 无来源证明，保留旧 v1 `tools:[read]`，不得升级 policy 或全量继承。
- `.mjs` fixture 本身同时作为 Next `NODE_OPTIONS=--import` 网络 guard，源码不复制进
  temp。Next 启动 cwd 为隔离 project，显式 `next dev <worktree> --turbopack`；fixture
  factory 断言运行 cwd 仍位于 PI_TASK_TMPDIR，防止默认 cwd API 扫描真实祖先资源。

## 实跑后的断言矩阵

| 路径 | 真实行为/证据 |
| --- | --- |
| 新 child | 浏览器 parent prompt → native faux Agent 调用 → 产品创建真实 explore child；默认继承 snapshot、GPT model_change、搜索实际执行、child 标签 |
| warm resume | 关闭 context/SSE lease，等待产品 idle shutdown；浏览器 parent prompt → Agent resume 相同 child id，模型/search 不变 |
| reload/重开 | 真实 reload RPC 后 browser send 再搜；页面 refresh 后标签一致 |
| cold | 关闭自己 Next 进程组，SDK 在 child 分支追加物理 Kimi 历史，新 Next 进程直接打开 child，不打开父 wrapper；打开前后 same-id/leaf；再发送仍 GPT |
| 失效原模型 | 390px 浏览器真实 Send → prompt_rejected/accepted:false；明确未发送提示、原草稿保留、旧 branch/result 完全不变，provider call 数不增加 |
| 明确改选 | 点击真实 model selector → set_model gateway/fixture-replacement；标准 model_change 落盘后才再发送，搜索成功，refresh 标签/选择保持 |
| 旧 false | 无活父来源证据的旧 snapshot prompt 拒绝、零请求/搜索、原 metadata 完全不变；不冒充旧 false 合法 provider-only 成功路径覆盖 |
| 新表单 | 1280px 与 390px Settings → Agents → New sub-agent，Load extensions checked、Load skills unchecked；真实 control bounds 和截图，不保存文件 |
| 安全/清理 | settings 字节不变、Kimi/外部模型/外部搜索为 0；只清理 runner 自己 PID/process group、browser、backend 和 temp |

## 提请主代理协调确认的最窄合同（不修改其他 owner）

1. **toolPolicy** 按 design 暂采用：
   `{"version":1,"builtinTools":["read","grep","find","ls"],"extensionAllow":["ext:*"],"extensionDeny":[]}`。
   `resourceSnapshot.version=1`，新增 policy 是可选字段；旧 false fixture 无 policy。
   如果 decoder 需要新的必填字段，请给出精确 shape 后只调整 fixture。
2. **RPC** 已使用现有 POST `/api/agent/[id]` 的
   `{type:"prompt",message}`、`{type:"get_tools"}`、`{type:"reload"}`，browser picker 自然发
   `{type:"set_model",provider,modelId}`。`/api/agent/new` ensure_session 返回 sessionId。
   Prompt 拒绝保留 `code:prompt_rejected, accepted:false`，安全响应含失败目标 retired-gpt。
   具体 `selectionError/detail` 字段名未锁死；浏览器断言真实可见英文 “not sent / no request was sent”
   语义。如实现文案/DTO不同，请协调准确文本，不 mock 拒绝响应来让测试通过。
3. **get_tools** 沿用现有 `data.tools` 或 `data` 数组，条目 `name/active`；检查迟注册
   web_search active，并确认 reserved controls/ask_user 不暴露。
4. **新 child 发现** 用真实 SDK listAll + 分支 `pi-web:subagent` metadata，parentSessionId/
   description/resourceSnapshot 不增加 browser-only 产品 endpoint。
5. **旧 false** 无合法 alive 父和 providerSources 应明确拒绝（设计批准边界）；本脚本不要求
   其通过 set_model 绕过来源限制。完整 provider-only lifecycle/tool 授权由 SDK/core 测试覆盖。

## Static 检查命令（不启动服务）

```sh
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
node --check e2e/subagent-model-selection.mjs
node --check e2e/fixtures/subagent-model-selection.mjs
node_modules/.bin/eslint --max-warnings=0 e2e/subagent-model-selection.mjs e2e/fixtures/subagent-model-selection.mjs
```

首轮 syntax 两条退出 0；首轮 lint 0 errors/2 unused-variable warnings，随后删除该解构写法。
最终复查：两条 `node --check` 均退出 0；focused ESLint `--max-warnings=0` 退出 0，
0 errors/0 warnings；`git diff --check` 退出 0。没有把 static 检查等同于浏览器验证；没有运行全仓 tsc/test
冒充并发实现代码的验证，也没有 next build。

## 产品 ready 后的唯一隔离运行形状

仅在主代理确认 ready 后执行下面命令（当前**未执行**）：

```sh
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
SANDBOX_HOME=$(mktemp -d --tmpdir=/var/tmp pi-subagent-browser-home.XXXXXXXX)
trap "rm -rf -- \"$SANDBOX_HOME\"" EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME \
  HOME="$SANDBOX_HOME" TMPDIR="$SANDBOX_HOME/.cache/pi-tmp" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run --keep-on-failure subagent-model-browser -- bash -c "
    cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
    export HOME=\"\$PI_TASK_TMPDIR/home\"
    export PI_CODING_AGENT_DIR=\"\$HOME/.pi/agent\"
    export XDG_CACHE_HOME=\"\$PI_TASK_TMPDIR/cache\"
    export E2E_PRODUCT_READY=1
    export PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell
    node e2e/subagent-model-selection.mjs
  "
```

Runner 自动选择独立 ephemeral port（拒绝 30141），记录每个阶段精确 PID/port/cwd/source/log。
源码/依赖不复制进 temp。Playwright results 固定 `PI_TASK_TMPDIR/results`，不启用 video，
trace 只在失败时保存；成功 trace 丢弃。Finally 先关自己的 browser、Next process group、
本地 backend，结束 log，然后复制正式证据到本任务 research 下唯一
`subagent-model-selection-browser-<timestamp>/`。成功删除自己 fixture HOME/project/cache/results，
外层 trap 清理唯一 validation HOME；失败的正式日志也先转存，不依赖缓存唯一副本。

## 尚未覆盖/剩余风险

- **全部运行时/browser 断言尚未执行**，当前只能确认 syntax/lint。产品接线/API窄 shape 与
  Playwright locators 需在 ready 后真实运行校准；不能根据源码阅读宣称通过。
- Safari/Windows/真实付费 provider/真实 pi-sub2api 搜索扩展/原生搜索 request hooks 均未覆盖。
  本地 fixture 覆盖的是 native faux provider + direct late web_search 的真实宿主通路。
- 并发 cold set_model、权限 alias/deny/nested、no-install/trust/revoke 的完整安全矩阵不在本
  browser 脚本重复，由核心集成测试 owner 负责；本脚本不更改 stage1 helper。
- TCP/browser tripwire 零事件是强拒绝证据，不是系统级抓包/沙箱声明；没有真实凭据或生产 URL。
