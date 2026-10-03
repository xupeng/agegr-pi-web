# Settings › MCP 管理契约

## 1. Scope / Trigger

修改 MCP 配置读取/写入、导入、Test、OAuth 或 trust API 时更新本文件。运行时惰性连接、slash 分类、Code mode mode/budget 与 fork 边界由 [mcp-codemode](./mcp-codemode.md) 拥有；不重复上游 ADR/操作说明。

owners：`app/api/mcp/route.ts`、`lib/mcp-entry-request.ts`、`lib/mcp-config-read.ts`、`lib/mcp-config-file.ts`、`lib/mcp-add.ts`、`lib/mcp-test.ts`、`lib/mcp-sign-in.ts`；视图为 `components/McpConfig.tsx`、`McpAddServer.tsx`、`McpSignIn.tsx`。

## 2. Signatures

```ts
GET /api/mcp?cwd=<absolute-folder> // cwd 可省略，只列全局
// => McpResponse { mcp, codemode, files, servers, project?, hostInactive?, toolSearchDisabled? }
POST /api/mcp { action, cwd?, ... }
// enable | disable | remove | sign-out: { scope: "global"|"project", name }
// set-enabled: { enabled: boolean, servers: [{ scope, name }] }
// set-exposure: { scope, name, exposure: "direct"|"codemode"|"deferred"|"hidden" }
// undo: { token }
// add: { text, scope, values?, secretReferences?, server?, name?, rawPi?, trustFolder?, confirmHostEnv? }
// => McpActionResponse = overview + undo?/restored?/results?/signedOut?/added?/trust?/trustedFolder?

POST /api/mcp/test { scope, name, cwd? }
// => { scope, name, configKey, result: McpTestResult }
POST /api/mcp/sign-in { scope, name, cwd? } // => McpSignInFlowInfo
GET /api/mcp/sign-in/[flowId] // => McpSignInFlowInfo
POST /api/mcp/sign-in/[flowId] { redirectUrl: string } // => flow
DELETE /api/mcp/sign-in/[flowId] // => cancelled flow
GET /api/project-trust?cwd=<absolute-folder> // => trust status + mcpFile?/mcpServers/mcpError?
POST /api/project-trust { cwd } // => ProjectTrustStatus（不含 listing）
```

以实际 route 分支为准：`set-exposure` 已实现，不能仅照 `McpServerAction` alias 枚举少列这个 action。DTO 唯一 owner 为 `lib/api-types.ts:207` 起。

## 3. Contracts

- GET 只读文件，不启动服务器、不展开 env、不执行 `!command`，即使项目未受信任也可列出；不泄漏 env/header literal values，URL/args 秘密片段掩码。`configKey` 是 canonical entry 的进程级 HMAC，不是含秘密的 JSON；status 仅在相同 entry key 下展示（`mcp-config-key.ts`、`mcp-status.ts`）。
- global 路径是 `<agent-dir>/mcp.json`，project 是 `<cwd>/.pi/mcp.json`。项目路径经 allowed-roots、realpath、regular-file、有界读取校验（1 MiB/最多列 200 servers）。新文件 0644，既有项目文件保留 mode；global 0600。写入有进程队列/文件锁、同目录 temp rename，保留 symlink 和未知字段、原缩进/末尾换行；enabled=true/exposure=codemode 删除 key。**Pi CLI 不用此锁**，不能声称 CLI 与 Web 跨进程改写绝无竞争（`mcp-config-file.ts:16-30`）。
- POST config 不因保存而连接，运行中会话下条消息 sync 差异。operator disable/SDK internals 缺失时面板只读，不能浏览器覆盖；`-builtin:mcp` 不禁止显式管理/Test（项目可能反向设置）。每项 project 写/Test/sign-in 需 fresh true decision，不能把无资源目录的 `trusted:true` 当已授权（`mcp-entry-request.ts:119-147`）。
- remove 只返回服务端暂存的 token（60s），不把 secret entry 发浏览器；undo 保留原位置，不覆盖新占同名，失败可在剩余期限再试。bulk 1..500 refs、同 scope/name 去重，按请求顺序返回 results，一项拒绝不阻止其它 scope/entry（`app/api/mcp/route.ts:172/280/325`）。
- add 是同一纯 importer 的浏览器 preview + 服务端重解析，**不是接收浏览器成品 config**。text ≤262144 字符、server 默认 0；values 为 field id → string 或 `{ reference: NAME }`；secretReferences 为 label → NAME。URL/命令/客户端 JSON/install links 可导入，不认识的 key 丢弃并给 notes。非 Pi 的 resolved fields（env/header/oauth.clientSecret）转义 `$` 和 leading `!`，rawPi 或 pi CLI 才保留 Pi 语法；command/args/url/cwd 本身不作 env substitution（`mcp-import.ts:24-50`）。
- literal secrets 仅可存 global；项目可将可引用字段改成 `${NAME}`。非 Pi paste 的 HTTP header/clientSecret 若读取宿主已存在变量，且不是用户显式选择的变量，需 `confirmHostEnv`；stdio env 不适用此确认。任何 Web 密码引用拒绝。`trustFolder:true` 仅允许无决策/无 trust-relevant entries 的 fresh folder，拒绝 home/root/过宽父目录/悬空资源链接；trust 后写失败需回滚，回滚失败响应 `trustKept:true`（`mcp-add.ts:183`、`project-trust.ts`、route-add tests）。
- Test 从文件重读 entry，不信任浏览器 config；独立临时连接、不创建 AgentSession/不发模型请求，可启动 stdio 或执行 `!command`。global stdio cwd 用已校验面板项目或 HOME；result 的 state 为 connected/needs-auth/failed，带 tools/toolCount/durationMs/testedAt，错误及 stderr 脱敏并各限 2000 字符；tools 最多 500。请求 timeout 上限 15s、整体 20s；同步 `!command` 阻塞 event loop，deadline 无法中断它（`mcp-test.ts:31-60`）。
- sign-in 仅 OAuth HTTP（无 Authorization header、无 auth.provider），按 URL join flow，POST 立即返回，浏览器轮询/粘贴 loopback redirect，不在服务端打开浏览器。phase：connecting/starting/authorize/finishing/done/failed/cancelled/expired；flow UUID 在结束一分钟后失效（容量回收也可提前移除 ended flow）；默认总期限五分钟，finishing 已拿到 code 时仅一次额外一分钟宽限（`mcp-sign-in.ts:89-98/536`）。错误 paste 保持等待；二次连接前重查 operator/project trust，失去信任可已存 token 但不再连接。sign-out 从文件取得 URL，取消同 URL 在途 flow 并阻止迟到 token 写入，清 SDK mcp-auth 存储/状态，不删除 mcp.json；cancel 不等于 sign-out（`mcp-sign-in.ts`、`mcp-sign-out.ts`）。
- project-trust GET 在无法读 trust store 时仍可返回 MCP listing；POST 信任会 invalidates model cache 并销毁该 cwd 的空闲 wrappers，busy 拒绝，不能中途重建运行中的 wrapper（`app/api/project-trust/route.ts:59-114`）。

## 4. Validation & Error Matrix

拒绝携 `{ error, reason, ...params }`（字段见 `api-types.ts:653` 起）；reason 是翻译键，error 是诊断，不按英文文本分流。

| 条件 | HTTP / reason |
| --- | --- |
| 来源不允许 / POST 非 JSON / 畸形操作 | 403 request-denied / 415 content-type / 400 invalid-request |
| cwd 非绝对或空 / 根外、`..`、不存在 / 非目录 | 400 cwd-invalid / 403 cwd-denied / 400 cwd-not-directory |
| operator MCP off / internals 不可用 | 409 mcp-off，GET 仍列可读配置并报 availability |
| 项目无 true trust decision / trust store 不可读 | 403 project-untrusted / 409 trust-unreadable（管理/Test/sign-in） |
| 文件不解析/形状错/链接或文件类型错、大小超限、锁占用、entry 缺失或非对象 | 409 对应 reason，文件不改；unexpected unreadable 为 500 internal |
| add import/填值/名字非法 / 同名 / literal project secret / 未确认宿主变量 | 400 import-failed/fields-incomplete/name-invalid；409 name-taken/secret-global-only/host-env-confirm |
| entry SDK 校验不通过 / Web 密码引用 | 409 server-invalid / web-password；密码项仍允许 disable/remove/exposure edit |
| undo token 失效 / 同名已占 | 410 undo-unavailable / 409 undo-name-taken |
| 非 OAuth / flow 未知 / 不在等待阶段 | 409 sign-in-not-oauth / 404 sign-in-unknown / 409 sign-in-not-waiting |
| redirect 非 URL、state 错、无 code、OAuth refusal | 400 redirect-invalid/redirect-state-mismatch/redirect-no-code/redirect-denied，不结束 flow |
| trustFolder 不再 fresh / 过宽 | 409 folder-not-fresh / trust-too-broad |
| project-trust GET 读 store 失败 / POST 无需 trust、busy | 500 trust-unreadable（含 listing）/ 409 trust-not-required、session-busy；POST unexpected failure 为 500 internal |

## 5. Good / Base / Bad Cases

- Good：添加前 preview 与服务端 reparse 一致；先读 listing 再批准项目，Test 使用本地 fixture，配置保存后下条消息才连接。
- Base：无 cwd 时管理全局；untrusted project 可只读展示；关闭 MCP 不阻止查看文件，但不允许写或测试。
- Bad：GET 隐式跑 `!command`、相信浏览器传 config、把取消 OAuth 当清 token、把普通目录默认 trusted 当项目写授权、把 closedAt status 当当前仍连接。

## 6. Tests Required

- `app/api/mcp/route{,-write,-add}.test.mjs`：来源/DTO/禁用与 trust、per-item bulk、undo 重试、密码禁止 enable、literal secret/变量确认、fresh trust 与回滚失败；断言拒绝后文件 bytes 不变。
- `lib/mcp-{config-read,config-file,import,add,secrets,status,undo}.test.mjs` 及 import integration：SDK editor bytes、锁/symlink/regular-file、secret 不出 DTO、转义与 known-key import；status key 不跨 entry。
- `app/api/mcp/test/route.test.mjs`、`lib/mcp-test.test.mjs`：文件入口/trust/MCP off、timeout/queue、脱敏、工具数量界限；不连用户服务器。
- `app/api/mcp/sign-in/route.test.mjs`、`lib/mcp-sign-in{,.integration}.test.mjs`：join、paste state/code、cancel/expiry、sign-out 阻止迟到写、lost trust 后不 reconnect。
- `app/api/project-trust/route.test.mjs`、`lib/project-trust.test.mjs`：绝对 cwd、继承 decision、GET 失败保留 listing、busy/no-required、fresh breadth/link 与回滚。
- `components/Mcp{Config,AddServer,SignIn}.test.mjs` 与 helper tests 固定 UI/请求边界；真实浏览器另验 Settings 导航、paste/confirm/Test/sign-in/out、移动布局与三语。源码/Node 测试不证明浏览器通过，本次同步未验项目不得写已通过。

## 7. Wrong vs Correct

Wrong：直接接收 `{ config }` 写项目，然后 GET 连接它来判断好坏。
Correct：`prepareMcpAdd()` 从 paste 重解析/填值/校验，fresh trust + locked writer 保存；GET 永远只读；用户明确 Test 才通过 `readConnectableMcpEntry()` 重验并临时连接。不得为面板另造 transport/sanitizer 或 ask_user 阻塞通道。
