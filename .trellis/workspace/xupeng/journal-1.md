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
