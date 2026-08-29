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
