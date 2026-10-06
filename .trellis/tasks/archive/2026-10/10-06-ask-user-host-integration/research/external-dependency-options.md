# 外部正式依赖与单次发现方案（planning，只读研究）

> 已撤回的历史备选：用户随后澄清使用系统已安装版本，Web/TUI 投影并立。本文 tarball dependency、遮蔽系统包/facade 等建议是助手误读，不是获批决定；不得执行或作为当前实施上下文。最新 system-installed-host-decision.md 与 PRD/design/implement 为准。

## 结论

**推荐：Pi Web 的生产 `dependencies` 使用 GitHub 固定 commit tarball；共享核心直接 import 外部包子路径；SDK 在同一个 DefaultResourceLoader 中加载正式依赖的 `index.ts`；Web inline 扩展只装宿主 bridge，不再注册自有 ask_user。** Web React view/controller 留在 Web，改名移动为宿主 UI。用户无需另装扩展、无需 git、无需改真实 settings、无需发布 pi-ask-user 到 npm，也无需本轮改外部仓库。

固定提交：`59e0256c869e9ce04abffc1204537c7bf1501450`。本次只读 `git rev-parse HEAD` 与外部 manifest；主线程另已核实 npm 11.19.0、远程 main/HEAD 同 SHA，以及官方 npm v11 文档支持 Git commit 与 URL tarball dependency。**本子代理没有下载 archive、npm install 或构建，以下为可实施路线，不是安装/build 验证通过的宣称。**

之前 `loader-source-and-minimal-plan.md` 的「Web-owned tool 优先 / 无包 fallback」已被用户决定否定，本文取代那部分建议。缺包或不兼容应给明确错误、关闭 ask 能力；不得退回 Web 本地工具副本。

## 1. 已核实锚点

| 文件 | 事实 |
| --- | --- |
| `package.json:34-44,68-86` | 发布白名单是 bin/.next/public/config/package.json，不包含 lib；SDK 在生产 dependencies。新包必须进 dependencies，不能只放 devDependencies。 |
| `package.json:47-67`、`scripts/release-npm.sh:63-95` | 发布先 build 再 npm publish；npm 用户安装靠发布 manifest 的 dependencies，不能假设发布方 lockfile 会锁定消费者。SHA 必须写进 dependency spec 本身。 |
| `next.config.ts:16,39-63` | tracing root 是 Web 根；当前 transpilePackages 只处理 mermaid，SDK serverExternalPackages 保留运行时实体。 |
| `bin/pi-web.js:40-62,97-101` | CLI 找 Next 路径后以 `cwd: pkgDir` 启动；生产 server cwd 是安装包根，而不是聊天 session 的 cwd。 |
| `/home/xupeng/services/pi-web/run.sh:151-186` | 仓库 npm ci/build；dist 复制 manifest/lock/.next 后 `npm ci --omit=dev`，不复制源码 lib。正式 dependency 可自然进入 dist，不能硬编码源码工作目录。未操作该脚本。 |
| 外部 `package.json:1-48` | `private: true`, `0.0.0`, `type: module`，无 main/exports；明确 files 和 `pi.extensions: ["./index.ts"]`；SDK peers 为 `*`，dev baseline 0.85.1。 |
| 外部 `index.ts:20-33,36-75` | 默认 factory 注册桥接工具及 TUI adapter；子模块及桥协议可复用。Web view/controller 不在外部包里。 |
| SDK `dist/core/resource-loader.js:360-418,545-585,781-791,873-889` | 配置包与 additionalExtensionPaths 合并；实际路径 canonical 去重；factory 加载后才调用 extensionsOverride；冲突只诊断，不自动去重。inline factory 与 package 共用 loader event bus。 |
| SDK `dist/core/package-manager.js:702-736,746-760,1067-1086,1392-1422` | packages 来自 SettingsManager 的 global/project getter；本地包按 settings 所在目录解析。身份是 npm 名、git 仓库 URL 或本地绝对路径，不是 manifest.name。 |
| SDK `dist/core/extensions/loader.js:462-482` | SDK jiti 加载原始 TS entry，并把 SDK imports 指向宿主 aliases，不要求扩展先编译 JS。 |
| `lib/rpc-manager.ts:2682-2722` | 已有 services resourceLoaderOptions / extensionFactories / extensionsOverride 接入点。当前 inline ask 工具必须换成 bridge-only。 |
| `lib/ask-user/extension.ts:20-37` | 当前 Web 直接注入本地 tool factory；不是 bridge listener。 |
| 外部 `tool.ts:134-175` | 工具实际 execute 与 terminate 在外部 factory；未声明 exposure，SDK 默认 direct。因此 Web 仍需投影 `model-only`，不必为此修改外部 repo。 |

已优先 `codegraph explore`；rpc-manager 被标记 stale，以上范围用 read 校正。SDK docs `packages.md`、`sdk.md`、`extensions.md` 及 `examples/sdk/06-extensions.ts` 也已读取。

## 2. 分发方式的实际区别

### A. 正式 npm dependency，固定 Git SHA

```json
"dependencies": {
  "pi-ask-user": "git+https://github.com/xupeng/pi-ask-user.git#59e0256c869e9ce04abffc1204537c7bf1501450"
}
```

- 是 npm **生产依赖**，不是「要求先发布 npm 包」。private 只阻止该包自身被 npm publish，不阻止被安装为 Git dependency。
- 用户 npm 安装 Web 时取得固定源代码。通常需要安装环境有 git；因此不如 B 适合最少前置要求。
- 现 manifest 没有 prepare/build/install 等生命周期脚本；无需先加构建流程或 main/exports。仍须在后续安装验收检查 Git dependency 的实际打包结果。
- Web 发布方 lock 更新后，dist 的 npm ci 锁一致；消费者不依赖 Web lock 才固定版本，因为 spec 自带 SHA。

### B. 正式 npm dependency，固定 GitHub commit tarball（推荐）

```json
"dependencies": {
  "pi-ask-user": "https://codeload.github.com/xupeng/pi-ask-user/tar.gz/59e0256c869e9ce04abffc1204537c7bf1501450"
}
```

- npm 下载 HTTPS archive 并安装到 Web 的 node_modules，**不要求用户本机有 git**；不用 npm registry 上存在 pi-ask-user。
- SHA 固定源 revision；后续生成的 lock 应记录 URL / integrity。固定 SHA 不意味着 npm 有 registry semver 更新语义，升级靠显式改 SHA/spec/lock。
- 需要访问 GitHub/codeload；代理、离线缓存、archive 字节变化导致 integrity 失败等分发风险要披露，不能假装与 npm registry 的运维完全相同。
- GitHub archive 是 Git 跟踪文件集合，不等同 npm pack 的 files 白名单；可能附带外部 tests/docs 等（不是 Web 复制核心）。应后续检查大小/内容，不能声称本轮验过 tarball。
- 此处 URL 是明确可采用的 npm dependency 形式；主线程核实远程 SHA，不等于本子代理已验证该 tarball 下载和 npm 安装。

### C. 只让用户 `pi install`，走 SDK package discovery

- 现包已经可本地安装，也可通过 SDK Git source 安装，不需 main/exports 或 npm 发布。资源发现依据 pi.extensions，而非 Node 包入口。
- 这只解决 **运行时 SDK 找扩展**，不解决 Web 编译期的共享 DTO/validator/formatter imports。Web React 编译时不可能可靠 import 用户未来才安装的未知工作目录。
- 不保证每个安装 Web 的用户都有包；版本随其 settings/目录变更，与 Web 发布不一起锁定。本地目录还可能在远端服务上不存在。
- 若不保留副本，仍要额外提供 Web 构建期核心依赖或显著改变协议/UI加载架构，因而不是本任务最小方案。

### D. 其他方式

- 发布 registry semver 包：未来可选，改善更新/缓存/完整性体验，但不是当前接入前置条件。
- `file:/home/...`、源码 symlink：只适合本机开发，发布/npx/独立 dist 不成立。
- 将外部核心 vendor/bundle 进 Web：违反本轮「去掉本地 portable 核心副本」方向，不推荐；SDK runtime 需要的 TS 包文件也不能仅靠 Next tracing 自动推断。

**没有证据表明必须先授权修改或发布外部包。** 已存在可固定的提交、pi manifest 和可引用子模块；主线程已核实远程同 SHA。以后只有选择外部 public exports/预编译 dist/registry 发布等新增目标时才另行授权。

## 3. 去掉核心副本、保留 Web 宿主 UI

### 删除／改引用

- 删除 `lib/ask-user/portable/{tool,bridge,types,validation,format,index}.ts` 及该层包声明；tool/bridge 核心测试改为针对安装的外部 dependency，Web 留宿主接入回归。
- `lib/ask-user/types.ts` 可保留极薄 re-export（`export * from "pi-ask-user/types"`）和 Web-only command/event DTO；不能继续复制类型和限额。
- `lib/ask-user/store.ts` 改从 `pi-ask-user/types`, `pi-ask-user/validation`, `pi-ask-user/format` import；保持 Web store/persist/admission/SSE/答案续跑实现。
- `lib/ask-user/tool.ts` 当前薄 wrapper 可删除；内部 `AskUserInvocation` 若仍需用，type-only import `pi-ask-user/tool`。不保留备用本地 factory。
- bridge listener 从 `pi-ask-user/bridge` 导入常量/DTO/错误；它是 **Web host adapter**，不是第二份 portable bridge resolver。

### 移为宿主 UI

- `lib/ask-user/portable/react/**` → 例如 `components/ask-user/**`。
- `portable/view-controller.ts` 及相应测试 → `components/ask-user/view-controller.ts` / 测试；它只拥有草稿/提交锁/reducer，外部包没有对应模块，保留不构成核心重复。
- `components/AskUserAppHost.tsx:5-6` 改到新 UI 路径；React view 的限额/DTO 从 `pi-ask-user/types` import，controller type-only 同样外引。
- 原 UI README/fixture 路径同步调整；名称应明确是 Web-owned UI，不再伪称 external package 中存在 shared React view。
- Client **只导入纯 types/validation 等所需子模块**，不要从外部 index barrel 导入，否则引入 tool/TUI/SDK 到浏览器。外部 types/validation/format 不依赖 React/Node。

## 4. 跨 build、npm 发布、dist/runtime 解析

1. Next 增加 `transpilePackages: [...现有项, "pi-ask-user"]`；静态子路径 imports（如 `pi-ask-user/types`）由 Next 的 TS/bundler 链处理。没有 exports 时 deep import 仍可解析到同名 `.ts` 文件，缺 main 只影响 bare `import "pi-ask-user"`，不应使用该裸入口。
2. **不要把纯 TS 核心强行列入 serverExternalPackages** 后让 Node 直接 import：外部模块用了 extensionless 相对 TS imports，Node 原生执行不是 SDK jiti，也不能凭 Node >=22 就保证成功。共享纯模块走 Next 打包；真实 extension entry 走 SDK jiti。
3. runtime 使用宿主根锚定的 Node resolver 找 `pi-ask-user/package.json`，取得包根或 `index.ts`：例如 `createRequire(join(process.cwd(), "package.json"))`，依据 bin 已保证 server cwd 为 Web 根。封装并校验此 invariant；不能用 sessionCwd、开发绝对路径或假设 `.next/server/chunks` 的 import.meta.url 等于源码位置。
4. enabled 主会话的 `additionalExtensionPaths` 注入解析出的包根（读取 pi.extensions）或明确 index.ts；bridge-only inline factory 加到 **同一个** loader。依赖 missing/load error 要清楚报错，不能返回本地工具。
5. 正常生产 dependency 将外部 TS 文件带到 npm/npx/dist 的 node_modules；SDK 现为 external runtime package，能 jiti 导入这些文件。当前是 next start 产物 + 生产依赖部署，**不是 standalone**。未来改 standalone 时另审动态 entry tracing/includes，不得拿当前 tracingRoot 当已证明动态文件必被复制。
6. npm 发布只收 .next 等并无问题：Web UI/静态共享核心在 bundle；动态 extension 由生产 dependency 提供。许可提示应保留，外部 LICENSE 随依赖存在，不要误删保留的版权说明。

后续最少要做一次 lock-consistent 隔离 npm ci、tsc/lint/tests、发布打包内容及仅生产依赖 runtime discovery 验收；本轮禁止 install/build，所以未做。

## 5. 正式依赖 + 用户已装工作目录：只能有一个 owner

**默认推荐由 Web 锁定的正式 dependency 做 canonical owner。** 用户原 settings 的工作目录条目不改，CLI/TUI 仍可使用它；只有 Web 的 loader 视图忽略该 duplicate 的 extension 资源。不要让本机工作目录悄悄覆盖已发布的 Web dependency。

### 必须区分「只保留一个有效工具」与「factory 只执行一次」

- 两个不同物理目录不会被 SDK 自动去重，即使 manifest.name 都是 pi-ask-user。
- `extensionsOverride` 在 module/factory 初始化之后执行；删除 duplicate tool 只能保证一个 effective tool，**不能称只加载一次**。外部 `index.ts` 还注册 TUI handlers/command/flag，不能仅删 ask_user、让第二套生命周期留下。
- 对同一路径/同一 realpath，SDK `mergePaths` 已 canonical 去重；正式安装副本和用户工作目录是不同 realpath，需宿主的加载前仲裁。

### 对本次已知 packages 工作目录源的最小、真正单次加载方案

在 Web 增加一个只用于资源加载的 **SettingsManager 只读视图／facade**，保持原 SettingsManager 和真实配置不变：

1. `getGlobalSettings()` / `getProjectSettings()` 返回按原作用域和 trust 状态取得的克隆；识别已存在、manifest 已确认的 pi-ask-user duplicate source，把该 packages 项投影为 object form `extensions: []`（保留 source 及其 skills/prompts/themes 等其他选择）。SDK 支持此官方资源过滤形式。
2. local source 仍按原 settings 目录解析；不能把 relative packages 当 session cwd 相对路径。不要只凭路径末尾名或工具同名来认定整个包是 pi-ask-user。
3. 原 facade 的其他方法必须 bind 原对象；reload 每次从原 getter 重新投影，不能冻结 startup 快照，不能调用 setPackages/save 写回。project getter 的 trust 隔离必须保留，不能自读未受信任的 project settings 并交给 loader。
4. canonical dependency 通过 additionalExtensionPaths 进入同 loader，忽略用户 duplicate packages 的 extension 部分后，只运行一个 entry factory。bridge factory 永远只注册一次同步 listener。
5. 本次已证实源是 global packages local directory，以上覆盖当前实际冲突。不必要求用户删除/重装包或改真实 settings。

额外扩展发现形式（用户 extensions 数组、auto-discovered symlink）需要相同的加载前禁用投影，使用 SDK exact negative path filters、保留 scope/trust 与用户其他资源；它们不是简单 `extensions: []` packages 投影能够全覆盖的事实。别宣称已经覆盖所有路径。

**SDK 1.0.0 的 DefaultResourceLoaderOptions 没有公开 pre-load path filter / 可注入 packageManager。** 所以推荐用公开 settings 边界做上述局部 facade，而非 patch SDK 私有方法。如果未来要求对所有未知自动目录都「绝不执行一次」，需进一步实现完整 discovery/filter 的 ResourceLoader；不应在小桥接任务中暗中扩张。

### 加载后的安全兜底（不替代单次加载）

- extensionsOverride 仍要验证 canonical extension 存在且唯一；正式依赖 entry 出错不得提升 duplicate 为 fallback。
- 可删除已确认重复 pi-ask-user 的整个 extension record（这是一个 ask 专用包），从而不绑定它的 TUI handlers/command/flag。混合功能的未知 extension 只能对 ask_user 做 tool-level policy，保留其他能力或明确拒绝；不能整包删任意同名工具来源。
- 当前已读外部 tui-host 通过 pi.on 注册 lifecycle，没有 pi.events 的宿主桥监听；对未来未知版本，仅靠删 record 无法撤销 factory arbitrary side effects，因此严格单次要求必须在加载前过滤。
- 处理预仲裁已产生的冲突诊断要精确限定已知被淘汰来源/符号，不能过滤整个 errors 集合隐藏真实加载错误。
- canonical 定义在 Web 主会话投影为 `exposure: "model-only"`，execute/schema/格式保留外部原定义。disabled / Chat-only / child 无此工具；child 即使 loadExtensions，也必须从 discovered ask_user 排除。保留既有 coding pins、active carry、reload admission 语义。

## 6. 本轮建议的产品边界

默认采用「Web 发布锁定版本优先，用户工作目录只在 CLI/TUI 生效」，不需要再问是否保留 Web fallback（用户已明确不要）。如确实还需用户选择，**最多一个事项：是否提供显式开发模式，允许用户工作目录版本覆盖正式依赖？** 推荐本轮不做；隐式自动覆盖会破坏可复现发布和 shared validator/UI 与 runtime 工具版本一致性。

bridge ack 仍有既有 Web best-effort persistence 债务（前一研究有锚点）；本研究的依赖选择不自动兑现 durable/outbox 或改变 submit/admission 语义，不借此扩大外部仓库修改范围。

## 验证与操作记录

- TMPDIR 已验证：`/home/xupeng/.cache/pi-tmp/01a10f6a-f9c9-753b-a8de-d78fece6765e`，非 /tmp。
- 本轮只读源码/manifest/git remote/status/HEAD、codegraph。遵用户后续要求未做耗时探针；无临时复制、安装、缓存探针、模型请求、真实配置写入、外部仓库改动或新增进程。
- 未 task start，未启动/重启/停止现有服务，未 next build；只创建本文 research 文件。
- 本子代理工具集未暴露 apply_patch，shell 也无该命令；因此用允许的新文件 write 保存本文，未用 bash/Python 修改产品文件。
