# Journal - xupeng (Part 1)

> AI development session journal
> Started: 2026-08-26

---



## Session 1: 修复条目详情页渲染崩溃并发布 dev/prod，PR #257 合并收尾

**Date**: 2026-08-28
**Task**: 修复条目详情页渲染崩溃并发布 dev/prod，PR #257 合并收尾
**Branch**: `main`

### Summary

修复条目详情页无法打开（两个 ReferenceError 白屏），发布 dev/prod，提 PR 至 upstream 并完成 closeout

### Main Changes

- fix(subject-detail): ReadySubjectDetailPage 补 agentPanelOpenNonce 解构与透传（7be4515 引入的崩溃）
- fix(subject-detail): SubjectHero 补 titleId 签名与透传（7397a7a 引入的崩溃）
- test(subject-detail): subject-detail-navigation.test.mjs 增加两处源码回归断言
- 发布 dev（id 35）与 prod（id 22），neogen page diff 无差异
- PR #257 → labs/banban main 已合并，分支已清理，本地/upstream/origin main 同步于 d09ff26

### Git Commits

| Hash | Message |
|------|---------|
| `320e58d` | (see git log) |
| `e1546a7` | (see git log) |

### Testing

- [OK] npm run build 通过
- [OK] npm run test:navigation 通过（subject detail gate 含新增回归断言）
- [OK] CDP 浏览器实测 dev 页：桌面/移动端条目详情均正常打开，无 console/pageerror

### Status

[OK] **Completed**

---

## Session 2: 上游同步 + 推荐流下滑自动加载（移除底部常驻按钮）

**Date**: 2026-08-28
**Task**: 移动端推荐流改为下滑自动加载，移除底部手动按钮
**Branch**: `main`

### Summary

从 labs/banban 上游同步（cd94859，搜索相关 2 提交），然后修复推荐流底部常驻的「刷新推荐」「加载更多推荐」按钮问题：
改为随下滑自动加载，仅在追加失败/无 IntersectionObserver 时保留兑底入口，并修复追加失败自动重试循环隐患。

### Main Changes

- 同步上游：`git merge --ff-only upstream/main` → cd94859，推送 origin（a2666d4..3aa6154）
- fix(recommend) 3aa6154：
  - 移除推荐列表底部无条件常驻的「刷新推荐」「加载更多推荐」按钮
  - 追加中展示「正在加载推荐」（复用 timeline-pagination__status）
  - 追加/刷新失败（status=ready 且 error 非空）时停止自动加载，展示「推荐加载失败，点击重试」；append 开始时清除旧错误
  - 自动加载 effect 增加 `recommendation.error` 守卫并加入依赖，避免失败时对可见锚点反复自动重试（既有隐患）
  - 无 IntersectionObserver 旧环境保留手动「加载更多推荐」兑底按钮
- 补充 recommendation-app.test.mjs 契约断言 + 更新 docs/recommendation-feed-product-requirements.md

### Testing

- [OK] recommendation-app / recommendation-feed / recommendation-state / pull-to-refresh / timeline 测试通过
- [OK] npm run build 通过；发布 dev 页（id 35），neogen page diff 无差异
- [OK] CDP 浏览器实测发布页（移动视口 390x844，已登录）：
  - 渐进滚动：items 8→15→22→28 自动追加，游标 start 0→9→16→23 正确；全程无 load-more 按钮
  - 追加中显示「正在加载推荐」
  - 拦截 recommend_feed API → 「推荐读取失败」+ 重试按钮；无底部按钮
- 注意：单次大跳滚到底时 IO 回调可能错过锚点（锚点已滚出视口），下一次滚动即触发追加；这是既有 IO 特性，与动态频道一致
- 注意：整页全被关键词过滤时自动加载暂停（既有机制），本次移除了该场景的手动加载入口，需关键词变化或频道重进恢复；产品文档已记录

### Git Commits

| Hash | Message |
|------|---------|
| `3aa6154` | fix(recommend): 推荐流下滑自动加载，移除底部常驻手动按钮 |
| `cd94859` | Merge pull request #260 from haidong/main（上游同步） |

### Status

[OK] **Completed**

## 2026-08-28 引入 vitest（task: 08-28-introduce-vitest）

基线（node:test）：313 tests / 313 pass / 0 fail / ~20.4s（迁移前 `npm run test:all`）。
迁移后（vitest 4.1.11）：117 files / 313 tests / 313 pass / ~23.5s，用例数精确对齐。
实际测试文件 117 个（33 node:test + 84 顶层断言），初勘 ls 递归不足低估为 71。
范围修正：84 个断言文件机械整体包裹（不缩进保护模板字符串），2 个跨文件副作用 import 移除。
分组脚本实测：test:navigation 20/26、test:collections 1/8、test:my-subjects 1/6、test:classification 全链 95+145+9、test:publish 1/1。
junit：test-reports/test-all.xml（117 testsuites / 313 tests / 0 failures），cherry.yaml 零改动。
PR: https://github.intra.douban.com/labs/banban/pull/264（draft, base=labs/banban:main）。
备注：git https 经代理(192.168.11.12:6789) TLS 握手 Broken pipe，需 `git -c http.proxy=` 直连绕过。

coverage 接入（追加）：vitest v8 coverage + cobertura，cherry.yaml coverage_path=coverage/cobertura-coverage.xml。
CI 实测 coverage=42.25%（lines 11645/27564）已上报 cherry，qaci summary coverage 列显示。
机制来源：cherry 源码（/home/xupeng/dev/douban/xupeng/cherry）templates/pipeline/common/coverage.groovy + parsers/handler/cherry_config.py（coverage_path 字段，fail_if_missing）。
本地全量用时 23.5s → 35s（+coverage），CI 2:53 → 3:21。

## 2026-08-29 修复会话列表因并发强制刷新竞态而变空（task: 08-29-sidebar-session-list-empty）

现象：在 session 中工作时左侧会话列表偶发持续为空，点手动刷新恢复。
根因：每轮对话结束 handleAgentEnd → setRefreshKey → SessionSidebar 并发发起 loadProjects(force)（全量重扫，慢）与 loadProjectSessions(force)（30s 缓存命中，快）；后者先回写缓存，前者后回时 force 分支清空所有项目会话缓存且无后续重拉 → 持续空。轮询不救场（排除当前选中 session）；手动刷新串行 await 所以能恢复。
修复（4 文件，+172/-68）：
1. SessionSidebar：loadProjects 不再 force 清空 per-project 缓存（旧数据保留到新数据就绪）；refreshKey effect 串行化（先 await loadProjects 再拉会话）；loadProjectSessions 加 per-key 请求序号防乱序覆盖。
2. AppShell：handleAgentEnd 不再 setRefreshKey（全量），改发 sessionActivity 信号（定向刷新当前会话行）；结构变更（创建/删除/fork/重命名）仍全量 force。
3. 服务端：新增 lib/session-reader.ts readSessionById（定向定位单个 .jsonl，不触发全量扫描、不 invalidate 内存缓存），从 loadAllSessions 提取 toSessionInfo 复用组装逻辑；sessions route 的 ?sessionId= 分支改走定向读取 + runtime 合并（原实现走 listAllSessions 过滤，只有 30s 缓存命中才轻量）。
验证：tsc 通过；lint 16 个 error 均为预存在基线（stash 对比确认，未引入新 error）；API 实测定向读取 14ms、不存在 id 返回空、projectKey 分支回归正常。
用户决策：范围=竞态修复+轻量刷新；机制=定向单会话查询（非本地 patch）。

## 2026-08-29 review 轮修复（task: 08-29-sidebar-session-list-empty）

trellis-check 独立审查（无 P0，5 项待修，均已修复）：
1. P1 transient 短路：route 的 ?sessionId= 分支先查 runtimeTarget.transient → 直接返回 runtime 版本，避免未写盘会话触发 resolveSessionPath 兜底全量扫描。
2. P1 行覆盖回退：sessionRowOverridesRef 记录单行刷新结果，loadProjectSessions 写入时合并（更晚的单行数据不被 30s 旧快照回退）。
3. P1 onSessionsChange：refreshSessionRow 写入后通知 AppShell sessionCatalog，避免切回根会话后读到旧行（subagent relation 等派生数据）。
4. P1 测试：更新 runtime-route.test.mjs 旧断言（all.filter/all.find → 新分支），新增 lib/session-reader.test.mjs readSessionById 定向读取测试（scans=0 验证不触发全量）。
5. P2 catch 序号保护：loadProjectSessions catch 只在最新 seq 时 setError，过期失败不残留。
另修 AppShell 两处 patch 引入的缩进损坏。
验证：tsc 通过；npm test 942/942（review 前 940/941 因旧断言失败 1）；lint 16 errors 全为基线；API sessionId/projectKey 回归正常。

## 08-29 ask_user 卡片会话切换/重开丢失（08-29-ask-user-card-rehydrate）

根因：
1. 客户端 loadSession includeState 分支 + 挂载 effect 漏恢复 state.pendingAsk（spec 写了"刷新后重水合"但实现没接上）；ChatWindow key=sessionKey 重挂 → 切会话/刷新/换设备卡片消失。
2. open ask 是进程级内存态，wrapper 10 分钟 idle destroy() 时 forgetSession 连同内存丢弃 → 隔久/重启后彻底不可见、不可答。

修复：
- 客户端（hooks/useAgentSession.ts）：loadSession includeState 分支、挂载 effect 恢复 pendingAsk；wrapper 不存在且无持久化 ask 时置 null。
- 服务端持久化（新 lib/ask-user/persist.ts）：`~/.pi/agent/pi-web-open-asks.json`（0600 原子写，best-effort 降级）；open/supersede 写盘、submit/cancel/cancelOpen 清盘、destroy 保留、会话 DELETE 清理；wrapper 重建时 PendingAskStore.restore() 保留原 askId。
- 路由回退：/api/sessions/[id]/state 与 GET /api/agent/[id] 在 wrapper 缺失但有磁盘 ask 时返回 { running:false, state:{pendingAsk} }。

验证：tsc 通过；npm test 954/954（新增 persist.test.mjs 10 例、store restore 3 例、客户端恢复源码断言 3 例、路由回退源码断言 1 例）；lint 无新增（16 errors 全基线）；编排冒烟脚本 open→destroy→rehydrate→submit 通过。
待办：dev server 端到端手工验证（真实模型 ask_user → 切会话/刷新/换设备/idle 后重开）。
- 并发复查：持久化读-改-写全同步，单进程（唯一支持形态）内多会话并发安全；多进程 lost update 为已知限制（原子写防损坏、影响可自愈），用户确认保持单文件方案，spec 与 persist.ts 注释已记录并发语义。
- 新问题（用户实机截图确认）：提交回答后卡片停在 "Submitted — delivering your answers..."，直到 agent 处理完才消失。根因：SDK `sendCustomMessage({ triggerTurn: true })` 在 agent 空闲时走 `_runAgentPrompt`，promise 要到整个 turn 结束才 resolve；`closeAsk` 里 `await` 它导致 ask_submit 响应挂起、客户端 syncPendingAsk 不执行。修复：closeAsk 改为 `void sendCustomMessage(...).catch(日志)` fire-and-forget，响应立即返回（与 voidOpenAskForUserMessage 一致）；新增 rpc-manager 源码断言测试。955/955 通过。
- 端到端实机验证完成（dev server 重启后，8505 端口）：(1) 发问题→切走会话→切回，卡片恢复显示并可作答；(2) 提交回答后卡片立即消失（不再停 "Submitted"）。用户确认两项均通过。
- 新问题（跨设备）：桌面卡片待答、手机提交后手机端消失但桌面端卡片残留。根因：ask.closed SSE 只到提交设备的实时流，空闲会话 SSE 已关闭（30s grace），桌面端无感知。修复：客户端卡片显示期间每 3s 轮询 /api/sessions/[id]/state（含持久化回退）兜底同步（hooks/useAgentSession.ts + ASK_USER_STATE_POLL_MS），本地提交仍走 ask_submit 响应即时关闭。956/956 通过；客户端改动刷新页面即可生效（无需重启 dev server）。
- 端到端验证全部通过（实机）：(1) 提交后卡片立即消失；(2) 切会话再切回卡片恢复；(3) 手机提交桌面 3s 内同步消失（跨设备轮询）；(4) 刷新页面卡片恢复。PRD 验收项全绿（idle 10 分钟销毁场景由单测覆盖：persist 往返 + restore + 路由回退 + 编排冒烟）。

## 08-30 设置中可调对话区字号（相对缩放）— 08-30-chat-font-size-control

需求：设置面板可调对话区字号，以当前字号为基准相对放大/缩小（非绝对字号），只影响对话区不影响其他界面。参考 banban 的 detailFontSizePreference（offset 模式）。

实现：
- 新 lib/chat-font-preference.ts：offset clamp [-4,+4]px，localStorage key `pi-chat-font-offset`，normalize 校验，损坏回落 0（对齐 banban 模式 + useTheme 的存储容错）。
- 新 hooks/useChatFontSize.ts：useSyncExternalStore 模块级订阅（对齐 useTheme），设置面板与 ChatWindow 即时双向同步，跨标签页走 storage 事件。
- globals.css：`.markdown-body` 字号改为 `calc(var(--chat-font-size-base) + var(--chat-font-size-offset, 0px))`，断点 base 15.5/17/16px 用 CSS 变量表达；未注入处回落 0px → 文件预览（.markdown-file-preview）等其余区域天然不受影响。
- ChatWindow 根容器注入 `--chat-font-size-offset`（子树内 markdown-body 仅对话消息；grep 确认 ChatInput/AskUserCard 等无 markdown-body）。
- SettingsPanel 常规→外观 下新增「对话区字号」控件（−/默认/+ 三按钮 + 当前偏移值，越界禁用），样式仿 banban 胶囊按钮风格，加到 app/settings.css。
- i18n 三语各 6 个 key。

验证：chat-font-preference.test.mjs 6 例（clamp/损坏回落/往返/存储异常容错）；SettingsPanel.chat-font-size.test.mjs 5 例（源码断言：控件、注入、CSS、三语文案）；相关回归 76/76；tsc --noEmit 通过；改动文件 lint 干净（16 errors 全基线）；dev server（8505）编译产物确认 CSS calc/控件样式/注入代码已生效。
待办：无（浏览器端到端可手工验证：设置→字号 +/默认，对话区即时变化，侧边栏/输入框不变）。

- 设置页滚动 bug 修复（用户移动端截图反馈：底部选项被裁剪且无法上滑）。根因：`.settings-general` 有 `overflow-y: auto` 但无高度约束（普通块级元素高度随内容伸展，永不溢出自身），内容被 `.settings-dialog-main` 的 `overflow: hidden` 裁剪 → 滚动永不触发。以前内容少没溢出所以未暴露；新增字号区块后溢出才出现。修复：`.settings-general` 加 `height: 100%; min-height: 0;`（对比 `.config-detail` 的 flex:1 + min-height:0 滚动链）。防御：移动端 `.settings-dialog-surface` 高度加 `100vh` fallback（老 webview 不支持 dvh 时 height 失效回落 auto 的同类风险）。验证：装好 chrome-headless-shell 依赖后用 CDP 实测，修复前 scrollH==clientH(1116) 不可滚+底部 CLIPPED，修复后 scrollH(1137)>clientH(776) scrollTop 0→361 可滚；新增 CSS 回归断言 1 例（6/6 通过）；tsc/lint 干净。

- iPhone 17 Pro 设置页异常（用户截图反馈）：弹窗悬浮（~84vh）、header/关闭按钮整个不可见、无法关闭；iPad mini（桌面布局）正常。headless 模拟 iPhone 视口一切正常 → iOS Safari 特有视口行为（100dvh/vh 在 iOS 26 Safari 上可算出异常高度）。根因：backdrop 用 align-items:center 居中，弹窗高度若大于可视区，顶部（标题栏+×）被顶出屏幕；用户无法点 × 关闭、点 backdrop 也落在弹窗上。
- 修复：设置弹窗与 config modal 统一改为 flexbox 经典模式——backdrop 去掉 align-items:center、加 overflow-y:auto；surface 加 margin:auto（空间充足时居中、不足时顶部对齐 + backdrop 滚动兜底）。验证：headless 模拟弹窗 1200px > 视口 874 时 top=0、header 可见、backdrop scrollTop 0→326 可达底部；正常视口下布局不变（桌面/移动均验证）；新增源码断言 1 例（backdrop 无 align-items:center、有 overflow-y:auto；surface 有 margin:auto）。7/7 测试通过、tsc/lint 干净。

- iPhone 17 Pro 设置页第二轮修复（用户反馈弹窗仍不可关闭，并建议小屏用全屏设置页）。margin:auto 修复后弹窗已能全屏，但弹窗顶部对齐视口顶（top≈0）时 header（Settings 标题/×）正好落在 iOS 状态栏（~59pt）下面被盖住，仍不可见不可点。修复：移动端（max-width:640px）设置页改为**全屏页面**而非弹窗——surface width:100vw / height:100dvh / radius 0 / border 0 / margin 0；backdrop padding 0；header 加 `padding-top: max(env(safe-area-inset-top), 0px)` 避开状态栏/刘海；iOS standalone 块拆分（settings-dialog-backdrop 不再加 padding，config modal 保留居中弹窗）。验证：headless 402×874 全屏 surface、header/× 在视口内、内容可滚；桌面 1440×900 与 iPad mini 744×1133（>640px 桌面布局）不受影响（84vh 弹窗居中、tabs 完整）；新增全屏回归断言 2 处（移动块全屏化 + header 安全区）。8/8 测试通过、tsc/lint 干净。

- iPhone 设置页关闭按钮不可见（第三轮）：全屏布局 header 的 `padding-top: env(safe-area-inset-top)` 让标题/下拉避开了状态栏，但 `.settings-dialog-close` 是 `position: absolute; top: 10px` —— absolute 相对 padding box 边框、不受 padding 影响，× 仍定位在视口顶部 10px，落在状态栏（viewport-fit:cover 下 env≈59pt）下面被盖住。修复：`top: calc(10px + env(safe-area-inset-top))`（桌面 env=0 不变），移动端放大为 44×44 点击目标（`top: calc(3px + env(...))` 在安全区下垂直居中）。曾尝试 history.pushState + popstate 支持侧滑返回/Android 返回键，实测 Next.js App Router 在 popstate 时重新 pushState 回相同状态、back() 无法关闭，已放弃该方案（测试 28/28 通过，tsc/lint 干净）。

## 发布记录

- 2026-08-30 发布 **pi-web 0.8.11-personal.11**（feat: 对话区字号相对缩放 + 移动端设置布局修复，commit d0e4559/0006e12）。
- 发布方式：`./scripts/release-personal.sh`（bump .10→.11 → commit → push personal → tag personal-0.8.11.11 → GitHub Actions 自动 build+release）。CI 1m54s 成功，GitHub Release 已创建（Latest）。
- 注意：npm 发布被放弃——本项目发布走 git tag + Actions，不直接 npm publish；`npm run release`（npm publish）在当前环境无认证不可用。
- 注意：`npm run build` 需 `TURBOPACK=` 前缀（环境变量 TURBOPACK=1 与脚本 --webpack 冲突）；build 会污染 .next，dev 前需清理。

- 2026-08-30 发布 **@xup3ng/pi-web 0.9.0** 到 npmjs（fork 独立首发，commit fb32fa7）。
- 包名决策：原计划 `@xupeng/pi-web` 不可用——npm 用户名 `xupeng` 已被他人注册（PUT claim 401），且用户名与 org 名共享命名空间、不能建同名 org；新注册用户名 `xup3ng`（注册时遇 Cloudflare 临时拦截，换 IP 成功），scope 用用户名即可发布，无需 org。
- 协议：upstream agegr/pi-web 为 MIT，允许 fork/修改/重新发布到 npmjs，唯一义务保留 LICENSE 中的 `Copyright (c) 2026 agegr` 声明（原样保留）。
- 发布流程（npm 11 + 2FA）：`npm publish --access public` 会走 web auth——终端打印 `https://www.npmjs.com/auth/cli/...` 链接，浏览器打开完成授权后自动继续（日志 PUT 200）；日志中 URL 会被 npm 脱敏为 `***`，无法代跑，需用户在自带终端执行。
- npm 新包发布后有最终一致性延迟：tarball/版本页（`/-/pi-web-0.9.0.tgz`、`/0.9.0`）立即可见（HTTP 200），但聚合文档（`/@xup3ng/pi-web`）和 `@latest` tag 解析延迟约 2-4 分钟才 200；`npx`/`npm view` 需等聚合文档传播完成。
- README×4（en/zh-CN/ja/ru）加 fork 声明、安装命令改 `@xup3ng/pi-web`、截图链接指向本仓库；package.json 补 author/keywords/publishConfig、bugs 指向本仓库 issues。
- 修正早前记录：「npm 发布被放弃」已过时——npm 发布已打通（npmjs.com 账号 xup3ng + 浏览器 web auth）；git tag + Actions 发布流程仍保留给 personal 内部版本。

- 2026-09-04 发布 **@xup3ng/pi-web 0.9.1** 到 npmjs（commit d4aa179）。流程：`./scripts/release-npm.sh 0.9.1` 在自带终端执行（npm login 2FA web auth 无法代跑），脚本自动 bump→build→dry-run→publish→registry 轮询验证→提交 bump。0.9.1 内容 = 发布基建（b4d7fc1）+ Electron safe-area 移除（见下）。
- Electron 顶部留白根因与移除：fork 曾在 personal 加 `html.electron` UA 嗅探（layout.tsx 内联脚本）+ `#pi-app-root { padding-top: 30px }`（d8469b5，为 pi-desktop 无边框壳的 macOS 红绿灯预留）；任何 Electron 渲染器都会命中 → 自带 chrome 的壳顶部出现多余空带。上游 agegr/pi-web 无此代码。已在 64341e0 整块移除、与上游一致（删 id/class/UA 脚本/CSS 共 5 文件，另更新 mobile-keyboard-viewport spec 中过时引用）。
- git 同步：fork 的 GitHub origin/main 本就已是上游 v0.8.11（28bab3c），无需推送；origin/personal 已推送至 d4aa179。
- 环境修复：~/.gitconfig 的 gh credential helper 路径写死 /usr/local/bin/gh（不存在，gh 实际在 /usr/bin/gh）→ git push 报 "could not read Username"；已改为 /usr/bin/gh。


## Session 2: 同步上游 v0.9.1 之后的 9 个提交并发布 0.9.4

**Date**: 2026-09-18
**Task**: 同步上游 v0.9.1 之后的 9 个提交并发布 0.9.4
**Branch**: `personal`

### Summary

把 upstream/main 在 v0.9.1 之后新增的 9 个提交合入 personal（唯一次冲突 components/ChatWindow.tsx 按设计表解决），同步 next 16.3.5 与两个锁文件，并在隔离 release root 中审计、打包、冒烟后发布 @xup3ng/pi-web@0.9.4（远端 tarball 与本地审计产物逐字节相同）。

### Main Changes

- merge: integrate upstream v0.9.1..860698a（9 提交；冲突块只取上游新视觉 + 保留 personal 的列内 ask_user 结构）
- chore: sync pnpm lockfile for next 16.3.5（time-based 解析，无无关漂移）
- docs(spec): 记录对话区字号/内容宽度链路与「验证基线必须来自锁一致依赖树」
- chore: release 0.9.4（本地历史跨过 registry 已占用的 0.9.3；只改 2 个版本文件）

### Git Commits

| Hash | Message |
|------|---------|
| `e5806e6` | (see git log) |
| `2fb2d11` | (see git log) |
| `d044656` | (see git log) |
| `3fad0a6` | (see git log) |
| `57924e3` | (see git log) |
| `c634468` | (see git log) |

### Testing

- [OK] tsc exit 0；eslint 462 文件 0 诊断（干净安装真基线同样 0；历史 14 条来自陈旧 node_modules）
- [OK] 全量单测 1239 pass / 0 fail（工作树与隔离候选树一致）；上游 5 个测试文件专项 27 pass
- [OK] 隔离 npm ci / next build / tgz 审计 / 生产安装 smoke / publish dry-run 全部 exit 0
- [OK] 远端 0.9.4 的 SHA512 SRI 与本地审计值一致且 tarball cmp 逐字节相同

### Status

[OK] **Completed**

### Next Steps

- 可选：push origin/personal、打 tag、建 GitHub Release（需另行授权，本任务明确不做）
- 可选：归档 09-12-sync-upstream-v091 / 09-13-npm-patch-release（本次未动）
- 未覆盖：e2e/run.mjs 与浏览器交互 smoke（D5 验证深度不含）


## Session 3: 清理发布临时产物（0.9.4 发布收尾）

**Date**: 2026-09-19
**Task**: 清理发布临时产物（0.9.4 发布收尾）
**Branch**: `personal`

### Summary

发布核验完成后按用户要求清理隔离产物：把 09-18 的审计证据提取为 240K 小包（research/evidence/：退出码 JSON、构建/打包/安装/dry-run 日志、703 条目 filelist、tgz 哈希、smoke 输出、可复现脚本），删除 3.5G 的 v094 release root；并按用户决定整个删除 4.5G 的 v093（09-13）release root（0.9.3 可从 registry 重下，删除前记录其 tgz SHA256 与远端 integrity）。顺带 prune 掉 3 条目录已不存在的陈旧 worktree 元数据，共释放约 9G。

### Main Changes

- chore(task): archive 0.9.4 release evidence and record cleanup（962d0e2）
- 删除 ../.pi-web-v094-release-20260918-182408（3.5G，证据已提取归档）
- 删除 ../.pi-web-v093-release-20260913（4.5G，用户选择整体删除）
- git worktree prune -v 移除 baseline/candidate/pi-web-0.9.2-verify 三条失效元数据
- 清理 /tmp 中本次产生的中间文件（保留他人/其它任务的目录）

### Git Commits

| Hash | Message |
|------|---------|
| `962d0e2` | (see git log) |

### Testing

- [OK] 清理后主 checkout：git status 未变（仅用户 3 个 agent 文件与 09-13 任务目录）、next 16.3.5、git worktree list 仅剩主 checkout
- [OK] 8505 dev server GET / -> 200；registry latest = 0.9.4，0.9.3 与 0.9.4 均可下载（integrity 未变）
- [OK] 磁盘：可用空间从 ~58G 提升到 65G

### Status

[OK] **Completed**

### Next Steps

- 可选：push origin/personal、打 tag、建 GitHub Release（需另行授权）
- 09-12-sync-upstream-v091 / 09-13-npm-patch-release 仍为 in_progress，未归档


## Session 4: 归档 10 个已完成任务，并发现字体许可文件缺口

**Date**: 2026-09-19
**Task**: 归档 10 个已完成任务，并发现字体许可文件缺口
**Branch**: `personal`

### Summary

按用户指示逐个取证后归档 10 个实际已完成的任务（功能已在代码中落地且无残留未完成标记），保留 2 个未完成任务。归档过程中发现一个真实的许可缺口：已发布的 0.9.3 含 public/fonts/LICENSE-cascadia-code.txt 与 NOTICE.txt，但这两个文件从未提交进仓库，因此主仓库与 0.9.4 缺少字体许可声明。

### Main Changes

- 归档 08-27-hide-tui-powerline-widgets（lib/extension-ui-settings.ts 默认 hiddenWidgetKeys=['powerline-*']）
- 归档 08-27-markdown-table-horizontal-scroll（.markdown-table-wrap overflow-x:auto + table width:max-content）
- 归档 08-29-ask-user-card-in-stream / state-reset / submit-lockup-supplement（askUserCardInColumn + ChatWindow 按 ask 重建 key + locked 状态 + supplement 输入）
- 归档 08-29-mobile-enter-sends / mobile-keyboard-cover（触屏需 ctrl/meta 才发送 + IME 保护；hooks/useViewportHeight.ts 处理 visualViewport）
- 归档 08-30-chat-font-size-control（SettingsPanel 字号控件 + hooks/useChatAppearance.ts）
- 归档 09-11-subagents-entry-visibility（lib/trellis-subagent-records.ts + TrellisSubagentRecords + spec 文档；仅剩用户验收）
- 归档 09-12-sync-upstream-v091（其 merge 分支已是 personal 祖先，上游 v0.9.1 整合已完成）
- 保留 00-bootstrap-guidelines（spec 中多个文件仍是 To fill）与 09-13-npm-patch-release（字体许可 + release-result.md 未收尾）

### Git Commits

| Hash | Message |
|------|---------|
| `15e47fd` | (see git log) |
| `cd645ea` | (see git log) |
| `850d5e6` | (see git log) |
| `ac320c3` | (see git log) |
| `f4f7f54` | (see git log) |
| `32786bd` | (see git log) |
| `c3cc74a` | (see git log) |
| `ad05356` | (see git log) |
| `e982653` | (see git log) |
| `7c90ef0` | (see git log) |

### Testing

- [OK] 每个归档任务都做了代码落地核对：powerline 默认隐藏、表格 wrap、ask_user key/locked/supplement、触屏发送判定 + isComposing、visualViewport hook、字号控件、trellis-subagent-records 均存在于当前代码
- [OK] 字体许可取证：0.9.3 公开 tarball 内含 LICENSE-cascadia-code.txt(4395B) 与 NOTICE.txt(1477B)；NOTICE 声明的 4 个 woff2 SHA256 与仓库现有文件 4/4 一致
- [OK] 归档后活动任务仅剩 2 个；git status 仍只含用户未提交的 3 个 agent 文件与 09-13 任务目录（后者已变为 current）

### Status

[OK] **Completed**

### Next Steps

- 决定字体许可缺口如何处置：恢复两文件并提交 / 恢复并发 0.9.5 / 仅记录
- 09-13 的 release-result.md 与本地 bump 提交仍未做（0.9.4 已跨越 0.9.3）


## Session 5: 恢复字体许可文件、归档 09-13、新建发布核验任务

**Date**: 2026-09-19
**Task**: 恢复字体许可文件、归档 09-13、新建发布核验任务
**Branch**: `personal`

### Summary

按用户决定处理 0.9.4 的字体许可缺口：从 registry 上已发布的 0.9.3 tarball 字节级恢复 public/fonts/LICENSE-cascadia-code.txt 与 NOTICE.txt 并加回归测试；归档 09-13 任务；新建 parked 任务 09-19 跟踪“下次发布必须带上这两个文件”。

### Main Changes

- fix(fonts): 恢复 SIL OFL 许可全文与来源 NOTICE（cmp 与 tarball 内字节一致；sha256 82c05d6c… / 9834f87f…），新增 public/fonts.test.mjs（断言两文件存在、NOTICE 列出每个 woff2、声明的 SHA-256 与实际文件 4/4 一致）
- docs(task): 在已归档 09-18 发布报告写入 §14 勘误——B5 的“字体与许可文件”子项当时只核了字体、漏了许可文件却判定通过（5a67988）
- chore(task): 归档 09-13-npm-patch-release（0.9.3 已发布并被 0.9.4 取代；其未完成的本地 bump/许可回流已由 5129887 覆盖）
- chore(task): 新建 09-19-font-license-in-next-release（仅 PRD，planning 状态，不复发布 0.9.4）

### Git Commits

| Hash | Message |
|------|---------|
| `5129887` | (see git log) |
| `5a67988` | (see git log) |
| `9a524db` | (see git log) |
| `65c6de3` | (see git log) |
| `7c90ef0` | (see git log) |

### Testing

- [OK] public/fonts.test.mjs 单独通过 2/2；反向验证（临时移走 NOTICE）失败 2/2，证明能拦住该回归
- [OK] 全量单测 1241 pass / 0 fail（新增 2 条测试后）
- [OK] 恢复文件与 0.9.3 tarball 内对应字节 cmp 一致；主仓库 4 个 woff2 的 SHA-256 与 NOTICE 声明 4/4 相符

### Status

[OK] **Completed**

### Next Steps

- 下次发布（0.9.5 或后续）时按 09-19 的 AC1/AC2 核验 tgz 含两个许可文件；发布需另行授权
- 00-bootstrap-guidelines 仍未完成（spec 中多个文件仍是 To fill）


## Session 6: Clickable file paths and the written-file pipeline

**Date**: 2026-09-19
**Task**: Clickable file paths and the written-file pipeline
**Branch**: `personal`

### Summary

Made file paths in agent replies open the right preview pane and rebuilt the files-written pipeline behind it. Extraction now covers apply_patch (summaries first, per-file +/- from the patch preview, delete targets excluded) and subagent output (full Trellis trace list instead of the 32-trace display window, plus a writtenFiles snapshot at built-in Agent completion that also reaches background notifications). Rendered text is linkified only when /api/file-index contains the path, and /api/file-index no longer offers tracked files deleted from the worktree. The files-changed chips became a card with a type line, this turn's +/- and inline preview/diff/copy actions. Verified with 1311 unit tests, a real-browser Playwright run and two real-session data scripts; delivered as xupeng/agegr-pi-web#1 (base personal), which is merged. Known gap: the background-subagent notification card still has unit coverage only.

### Git Commits

| Hash | Message |
|------|---------|
| `cfaef78` | (see git log) |
| `1695b29` | (see git log) |
| `82691fe` | (see git log) |
| `0c5b06b` | (see git log) |
| `981544e` | (see git log) |

### Status

[OK] **Completed**


## Session 7: Branch cleanup and fork main sync

**Date**: 2026-09-19
**Task**: Branch cleanup and fork main sync
**Branch**: `personal`

### Summary

Housekeeping session. Deleted five stale local branches: three were fully merged into personal (merge/upstream-v091-20260912-200432, recovery/upstream-v091-20260913-current-D/-L) and two were proven redundant before a force delete (backup/origin-personal-391c141 is superseded by 3fd4a33, and backup/ask-user-before-amend-ee672d7 is fully covered, its merge parent 860698a being an ancestor of personal). Synced main to upstream/main (d11d344) with a fast-forward push of 28bab3c..d11d344, so the fork's main is again a pure upstream mirror; local main had carried two commits upstream will never have. Folded the only one of those with real content into the personal line by cherry-picking 95a4a54 (archive 00-bootstrap-guidelines) as 80497c1, and deliberately did not apply f838a4e (trellis scaffold bootstrap) because 86 of its 100 files are byte-identical on personal while the other 14 are later rewrites there, so re-applying it would have reverted 285 lines. Finally dropped the archived 00-bootstrap-guidelines copy that the cherry-pick brought in: it differs from the still-open active task only in checked boxes, which five placeholder spec docs contradict. No branch checkout was needed for any of this (git update-ref plus cherry-pick on the current branch), so the three uncommitted .pi/agents/*.md edits were never touched.

### Git Commits

| Hash | Message |
|------|---------|
| `80497c1` | (see git log) |

### Status

[OK] **Completed**


## Session 8: Frontend spec bootstrap: filling six guideline docs

**Date**: 2026-09-19
**Task**: Frontend spec bootstrap: filling six guideline docs
**Branch**: `personal`

### Summary

Turned the six frontend spec files from trellis templates into real, code-backed conventions (1174 lines), which is what 00-bootstrap-guidelines existed for. Method: four parallel trellis-research sub-agents produced 2761 lines of evidence with file:line anchors (component conventions, directory layout, hooks and state, types and quality); three implement sub-agents then wrote the docs in Chinese, deleting or renaming template sections that did not apply and adding ones the templates lacked (i18n, component testing, client/server boundary, persistence, SSR). An independent trellis-check pass sampled 30 file:line citations (7 were wrong on the first pass and were fixed), recounted every numeric claim from the TypeScript AST (correcting e.g. as-casts 272 to 549, non-null assertions 0 to 66, interface/type 248 to 167), reconciled contradictions between documents, and confirmed the two pre-existing quality-guidelines sections stayed byte-identical. index.md now registers all six and states the real language convention (Chinese prose, English identifiers) instead of the unused English-only rule. Gates: tsc --noEmit clean, eslint 474 files / 0 problems, npm test 1311/1311. Committed as e619302 and pushed to origin/personal, then 00-bootstrap-guidelines was archived.

### Git Commits

| Hash | Message |
|------|---------|
| `e619302` | (see git log) |

### Status

[OK] **Completed**


## Session 9: Stall watchdog: aborting a turn that stops producing events

**Date**: 2026-09-22
**Task**: Stall watchdog: aborting a turn that stops producing events
**Branch**: `task/09-22-stall-watchdog`

### Summary

Gave pi-web a per-session stall watchdog so a turn that stops producing agent events is aborted instead of hanging forever. Every agent event re-arms a silence timer (15 min default, bash 30 min, env/config/0/invalid precedence); on expiry the turn takes the same abort path as Stop, so the extension's AbortSignal -> SIGTERM -> SIGKILL chain still reaps stuck children, and a stall_aborted event plus a server log report the last in-flight tool and the silence duration. Verified with 21 unit tests whose assertions were hardened by a mutation-testing check pass (which also caught a leaked listener on repeated start()), a real 90s-threshold dispatch that stalled a live trellis_subagent at 90009ms with zero leftover child processes, and a real 657.6s dispatch at the default threshold that finished untouched. The final check pass then flagged that the reason only lived in a 5s notice and the server log, which defeats the purpose for a user who walked away; the owner chose to fix it inside this task, so the task was re-opened and the reason is now persisted as a pi-web.stall.abort custom message that a reload renders as the localized notice (verified by a second real 90s dispatch whose transcript carried the entry with all seven fields equal to the event payload, no extra turn, and zero leftover children).

### Main Changes

- 新增 lib/stall-watchdog.ts：per-session 静默观察、阈值解析（env > 配置 > 默认，0 关闭，非法回落 + warn）、工具级宽限
- 接入 lib/rpc-manager.ts 的唯一事件回调，并抽出 abortTurn() 与用户 Stop 共用；destroy/agent_settled/用户 abort 停表，触发幂等
- stall_aborted 事件 + [pi-web] 日志 + 三语文案，复用既有 notice 通道，未新增 SSE 通道或 subagent producer
- 新增 lib/pi-web-settings.ts 共享设置读写，ask-user-settings.ts 改为复用
- 新增 spec .trellis/spec/frontend/stall-watchdog.md 并在 index 登记
- 返工追加：handleStall() 在 abort 前用 SDK 的 sendCustomMessage(triggerTurn:false) 写一条 pi-web.stall.abort custom message，落盘进会话 jsonl，刷新后仍可见
- 返工追加：CustomMessageView 对该 customType 用 formatStallAbortNotice 渲染本地化正文并隐藏裸 JSON details；英文 content 复用同一份 i18n 文案
- 返工追加：AC7 断言覆盖「条目字段与事件逐字段相等 / 冷读与 HTTP 都取回 / 提示之后没有新 turn」，并补了写入失败不阻止中止的用例

### Git Commits

| Hash | Message |
|------|---------|
| `a4bbc65` | (see git log) |
| `aa5e0c4` | (see git log) |
| `9c73c5e` | (see git log) |
| `8b17b4a` | (see git log) |
| `c36b81b` | (see git log) |
| `9cb34b9` | (see git log) |
| `a088d96` | (see git log) |
| `ec777f3` | (see git log) |
| `951a8c1` | (see git log) |

### Testing

- [OK] npm test 1407 pass / 0 fail；tsc --noEmit 0 错；改动文件 eslint 0 诊断（全仓 14 条为未改动文件的既有基线）
- [OK] AC5 真实派发：90s 阈值下 90009ms 静默命中 stall_aborted，settle 后零残留子进程
- [OK] AC6 默认阈值真实派发 657.6s（23 次进度事件）未被中止，工具成功结束
- [OK] AC7 返工后重跑 AC5：14/14 checks 通过（条目落盘、七字段对账、冷读 + HTTP 回读、无多余 turn、零残留），npm test 1411 pass / 0 fail

### 已知边界（如实记录，未修）

- 停滞卡片的标题仍是 raw customType（`pi-web.stall.abort`），正文已本地化；若要更像 toast 需另加 i18n 标题
- 该 custom message 会进入下一轮模型上下文（与 pi-web.ask.answers 同机制，`triggerTurn: false` 保证不起新 turn），这是有意接受的
- 静默分钟数取整（90s 显示为「2 分钟」）；浏览器侧 toast 与刷新后卡片的三语渲染都只有组件测试与数据链路证据，未跑 Playwright
- 全仓 `npm run lint` 仍有 14 个既有基线错误（未改动的 ChatInput/ChatMinimap/SessionSidebar），未做干净树 npm ci 复核

### Status

[OK] **Completed**

### Next Steps

- 可选：给 stall_aborted 的 toast 与刷新后卡片的本地化渲染补一次真实浏览器（Playwright）证据
- 可选：给停滞卡片加一个本地化标题（当前标题是 raw customType）


## Session 10: lint-baseline-drift: 归因并收口 14 条 preserve-manual-memoization

**Date**: 2026-09-22
**Task**: lint-baseline-drift: 归因并收口 14 条 preserve-manual-memoization
**Branch**: `task/09-22-lint-baseline-drift`

### Summary

把「全仓 lint 14 条既有错误」归因到锁文件选择（npm 7.0.1 vs pnpm 7.1.1），并把 14 处在两棵树上都修到 0 error，不改行为。

### Main Changes

- 用两棵干净安装树做单变量归因：同 495 文件、同规则级别，唯一差异是 eslint-plugin-react-hooks 7.0.1（package-lock.json）vs 7.1.1（pnpm-lock.yaml，fork 自有）
- 修正 spec 的旧归因（不是「旧树污染」，干净 pnpm 树同样复现），补机制/识别特征/恢复动作，删除写死的 462/474 文件数
- ChatMinimap：新增模块级 readRefCurrent，deps 保持 ref 对象（写 scrollContainer.current 会被 exhaustive-deps 判为可变依赖）
- ChatInput：filteredSlashCommands 与 buildSlashCommandLayout 结果改 useMemo（此前每次渲染重建，使既有 useCallback 失效）；两个图片 useCallback 上移到 useImperativeHandle 之前以消除前向引用
- SessionSidebar：currentWorktree/currentWorktreePath 用 useMemo 固定；P4（参数化）会打破 SessionSidebar.worktree.test.mjs 的源码断言，故放弃
- 主 checkout 执行 npm ci 恢复锁一致树，消除 react 19.2.8→19.2.4 等漂移

### Git Commits

| Hash | Message |
|------|---------|
| `5181b1f` | (see git log) |
| `26bafdb` | (see git log) |
| `9e0c52c` | (see git log) |
| `ec40c8e` | (see git log) |
| `bfec332` | (see git log) |
| `6347624` | (see git log) |

### Testing

- [OK] 7.1.1 pnpm 夹具：eslint 全仓 495 文件 0 error / 0 warning（修复前 14）
- [OK] 7.0.1 npm 夹具：0 error / 0 warning；两棵树 tsc 退出 0、npm test 1411 pass / 0 fail
- [OK] 主 checkout npm ci 后：lint 0/0、tsc 0、npm test 1411 pass / 0 fail
- [OK] 新增 research/slash-menu-keyboard.mjs：斜杠菜单键盘导航修复前后快照逐字节一致（方向键/Enter/Escape/过滤）
- [OK] e2e 记录为既有失败：/api/sessions/<id>/state 500，基线与修复后、dev 与 start 模式、Node 22.19 均一致复现，非本任务引入

### Status

[OK] **Completed**

### Next Steps

- 「state 路由 500」单独立项：它让 npm run test:e2e 在本机不能作为干净门禁
- 上游 package-lock.json 解析到 react-hooks ≥7.1 时，本任务的修复已让 CI 免疫


## Session 11: 发布 @xup3ng/pi-web 0.10.0（隔离构建 + 用户 2FA 发布 + 有界核验）

**Date**: 2026-09-22
**Task**: 发布 @xup3ng/pi-web 0.10.0（隔离构建 + 用户 2FA 发布 + 有界核验）
**Branch**: `personal`

### Summary

以 personal 冻结提交 e91dda7 为唯一基线，在仓库外隔离 root 内构建、审计、冒烟并封存 0.10.0 的 tgz（sha256 14c274de），由用户在自己终端完成不可逆 npm publish，随后核验通过并落地版本提交。

### Main Changes

- 隔离 root：/home/xupeng/dev/personal/forked/.pi-web-v0100-release-20260922-184342，复用 0.9.5 root 的脚本并适配版本串
- B2b 只在隔离 src 内 bump 到 0.10.0（仅 package.json 1 行 + lock 2 行）；主 checkout 保持 0.9.5 直到 B11
- B4 构建只在隔离 src 内进行，主 checkout 的 .next/node_modules mtime 逐项未变
- B5 审计：706 条目三处一致、包内 0.10.0、字体许可 2/2 + 4 woff2、无 .git/.pi/.trellis/.env/cache/dev/js.map、0 symlink、0 凭据
- B9 发布由用户终端执行 b9-publish.sh（脚本先 sha256sum -c 校验封存件），PUT 202、exit 0
- B11 版本落地提交 chore: release 0.10.0（8f537d0），沿用 0.9.4/0.9.5 的提交形式

### Git Commits

| Hash | Message |
|------|---------|
| `8f537d0` | (see git log) |

### Testing

- [OK] 隔离构建 exit 0 / 191s；BUILD_ID=NF_GCs4TJcsE0ZDwzzC0s
- [OK] 生产安装冒烟 20 项探针 200（唯一 405 为 /api/default-cwd 预期）、node-pty 建/查/删 200、listeners left 0
- [OK] publish dry-run exit 0，total files 706 与 filelist/pack entryCount 一致
- [OK] B10 核验：registry 0.10.0 且 latest 指向它，integrity/shasum/fileCount 全中，远端 tgz 与封存件 cmp 逐字节相同

### Status

[OK] **Completed**

### Next Steps

- 是否删除 0.9.5 root 与本次 root（各约 3.5G）待用户决定
- GitHub Release / personal-* tag 渠道仍硬编码 0.8.x，若要恢复该渠道需单独适配


## Session 12: 废弃并清理 personal-* GitHub Release 渠道（含孤儿 pnpm-lock）

**Date**: 2026-09-22
**Task**: 废弃并清理 personal-* GitHub Release 渠道（含孤儿 pnpm-lock）
**Branch**: `personal`

### Summary

删除已废弃的 personal-* GitHub Release 渠道（workflow + 脚本）与它唯一的消费者 pnpm-lock.yaml，把 docs/spec 改成单一 npm 锁与'渠道已废弃'的单一事实；历史 10 个 tag 与 Release 保留。

### Main Changes

- 删 .github/workflows/release-personal.yml 与 scripts/release-personal.sh（最后运行 2026-08-29，版本校验硬编码 0.8.x；0.9.0-0.10.0 全走 npm）
- 删 pnpm-lock.yaml：唯一消费者是该 workflow，上游无此文件；顺带消除 eslint-plugin-react-hooks 7.0.1/7.1.1 诊断分歧的来源
- docs/release-npm.md 删掉括注与 personal 行，改为'只有 npm 一条渠道' + 历史 Release 仍可下载但不再更新；docs/release.md 删掉 fork 注记（反而更贴近上游）
- quality-guidelines.md 的两锁机制段改写为历史注记（保留 14 条诊断实测与已修记录），恢复动作只留 npm ci 且明确 pnpm 树不可复算；upstream-sync 漂移清单与目录结构清单同步
- 历史产物按用户要求保留：10 个 personal-0.8.11.* tag 与 10 个 GitHub Release 未动

### Git Commits

| Hash | Message |
|------|---------|
| `6a865a2` | (see git log) |
| `b3b0094` | (see git log) |

### Testing

- [OK] 删除后在无 pnpm-lock 的树上 npm ci exit 0，树锁一致（react/eslint/next/@types-react 全 ok）
- [OK] 三件套：tsc 退出 0、lint 495 文件 0 error 0 warning、npm test 1411 pass / 0 fail（与 0.10.0 发布基线一致）
- [OK] AC5 全仓 grep：除 archive/、workspace/ 与任务目录外无 release-personal 活引用；spec 中无 pnpm-lock 现役描述
- [OK] AC7：git tag -l 'personal-*' 仍为 10 个，GitHub Release 仍为 10 条

### Status

[OK] **Completed**


## Session 13: ask_user 调用引导改进与独立扩展可行性评估

**Date**: 2026-09-25
**Task**: ask_user 调用引导改进与独立扩展可行性评估
**Branch**: `feat/ask-user-adoption-portability`

### Summary

改写 ask_user 的 promptSnippet/promptGuidelines，让模型在被缺失事实、范围选择或必要决策阻塞时优先用卡片提问而非散文提问；同时产出独立 Pi 扩展的可行性报告（仅文档，未实现、未改 personal-assistant）。

### Main Changes

- lib/ask-user/tool.ts 的 promptSnippet 改为「blocking clarification or a required decision」；promptGuidelines 明确适用条件（工具可用 + 被缺失事实/范围/决策阻塞）、合并提问、排除普通对话/修辞性提问/可选后续建议、工具不可用时回到散文，并保留「答案只作澄清不代替敏感操作授权」「单独且最后调用、不重发不轮询」
- lib/ask-user/tool.test.mjs 把 promptSnippet 的精确串断言改为 assert.match 契约断言，覆盖新引导的各个要点（仍只验证提示元数据）
- .trellis/spec/frontend/ask-user-protocol.md 增加调用引导条目，注明断言只验证元数据、实际效果需同模型同配置的独立会话记录，单次冒烟不能推断调用率
- 新增父子任务：父 09-25-ask-user-adoption-portability，子 09-25-ask-user-invocation-guidance（引导）与 09-25-ask-user-standalone-extension（可行性报告）；报告含可抽取边界、host 适配、scheduled 场景隔离、打包/失败模式与后续测试矩阵

### Git Commits

| Hash | Message |
|------|---------|
| `a6bae54` | (see git log) |
| `82e4c3b` | (see git log) |
| `c34ca07` | (see git log) |

### Testing

- [OK] [OK] node --test lib/ask-user/tool.test.mjs 4/4 pass
- [OK] [OK] XDG_STATE_HOME= npm test 1411/1411 pass（不设该变量时未改动的 lib/skill-lock.test.mjs 默认参数断言 1410/1411，属环境相关基线）
- [OK] [OK] node_modules/.bin/tsc --noEmit、npm run lint、git diff --check 均通过
- [OK] [OK] 隔离临时 cwd 冒烟：sub2api-codex/gpt-6-sol 对 DB 迁移提示发起两问 ask_user 卡片（单次观察，非调用率/前后对比结论）
- [OK] [OK] dev server 127.0.0.1:30141 上 GET / 与 GET /api/models 返回 200；本轮结束后已按用户要求停掉该 server

### Status

[OK] **Completed**

### Next Steps

- 用户自行运行/测试并决定是否开 PR；本分支未 push
- 三处 .pi/agents/trellis-*.md 与 pnpm-lock.yaml/pnpm-workspace.yaml 非本任务产物，未纳入提交
- 独立扩展若要落地，需 personal-assistant 侧提供 host bridge（pending 状态、持久化、答案投递、UI）并做 scheduled origin gating


## Session 14: Evaluate ask_user invocation behavior

**Date**: 2026-09-25
**Task**: Evaluate ask_user invocation behavior
**Branch**: `feat/ask-user-behavior-evaluation`

### Summary

Ran 24 isolated old/new ask_user guidance trials across four scenarios, recorded per-trial observations and caveats, verified the research runner, and archived the behavior-evaluation task.

### Git Commits

| Hash | Message |
|------|---------|
| `2c784ac` | (see git log) |
| `c623f12` | (see git log) |

### Status

[OK] **Completed**


## Session 15: Prototype portable ask_user extension

**Date**: 2026-09-25
**Task**: Prototype portable ask_user extension
**Branch**: `feat/portable-ask-user-extension`

### Summary

Validated SDK and PA Stage A local discovery, extracted a shared bounded ask_user package with an explicit fail-closed host bridge, preserved Pi Web behavior, updated the merged evaluation runner, and archived the portable-extension task.

### Git Commits

| Hash | Message |
|------|---------|
| `aadfb6f` | (see git log) |
| `41ffaa8` | (see git log) |
| `75eaaab` | (see git log) |

### Status

[OK] **Completed**
