# 通知中心技术设计

状态：最终规划已获用户批准进入实现（2026-10-06）。首版 Web-only，Pi SDK 四个 1.0.0 pins 不变。需求与范围的唯一 owner 是 `prd.md`；实现接口分工见 `research/implementation-boundary.md`。

## 1. 架构与职责

```text
SDK 公开只读 boundary observer + wrapper run tracker ── 完成候选 ─┐
原 ask store/持久化回退、存活 wrapper 的 extension pending ─────┤
                                                               ↓
                                    实例级通知服务/持久化/版本化快照
                                       ↓ GET/SSE        ↑ revision ack
                                    共享客户端 notification store
                                       ├─ 全局中心与铃铛
                                       ├─ 会话/项目标记
                                       └─ 完成结果可视 observer
```

- 服务端用 `globalThis`/稳定 symbol 单例，抗 Next 热重载；不得仅用模块级 Map。
- 客户端模块级 store + `useSyncExternalStore`，只有 AppShell owner 管连接，所有消费方共享稳定 snapshot；SSR 提供固定空 snapshot，挂载后才恢复。
- 完成状态归通知 store；交互状态仍归 ask/extension 原 owner。通知只存完成及必要迁移元数据，pending 是投影，不是另一套可提交任务。
- 系统通知权限只控制原 Web Push/浏览器通知，不影响站内中心。通知读/订阅不调用 startRpcSession，不持会话 liveness lease。

建议模块（名称允许在实现时按复用结果微调）：

| 模块 | 职责 |
| --- | --- |
| `lib/agent-run-tracker.ts` | run-local 纯分类、候选冻结、generation/identity |
| `lib/agent-run-observer.ts` | 只读 inline extension，公开 boundary witness |
| `lib/notifications/{types,store,persist,runtime}.ts` | DTO、完成状态/原子写、pending 聚合、窄订阅 |
| `lib/notifications/client.ts`、`hooks/useNotifications.ts` | 稳定共享 snapshot、连接/重连、命令合并 |
| `lib/notifications/viewed-result.ts` | 可视判定纯条件与观察作用域 |
| `components/NotificationCenter.tsx` | 列表/空态/错误态/操作，不提交交互 |
| `app/api/notifications/route.ts`、`events/route.ts` | 快照、ack/导入、实例级轻量 SSE |

不增加状态管理、表单、schema 或 DOM 测试库。

## 2. 数据合同

### 2.1 完成项

- `id`：completion + sessionId 的稳定条目身份。
- `revision`：每次实际新完成生成的不可复用 opaque token；不以 timestamp 或 sessionId 当版本。
- `runIdentity`：wrapper generation + logical run sequence，仅用于去重/归属。
- `sessionId`、`resultEntryId`、`completionLeafId`、`completedAt`。
- `origin`：live 或 legacy-import；导入项不得冒充新运行成功证据。
- 元数据：projectKey/显示名称、会话名称、受限 plain-text 摘要；仅取用户可见结果，不拼工具原始输出、thinking/system 或私有结果 details。
- 数据校验采用 unknown + 守卫；持久化版本号和字符串/数组/文本大小均有界。

`resultEntryId` 来自公开 turn boundary，而不是收到 message_end 时的当前 leaf。leaf 仅用于定位辅助，不能替代结果 entry。

### 2.2 等待项

- `id` 包含 sessionId + askId/requestId + kind；custom 重绘保持相同请求 id。
- `kind` 为 ask 或现有 blocking extension request；显示类型/时间/短摘要，不发送全部答案草稿或完整 custom render。
- pending 来自原 owner 当前快照；同会话可能同时有一个较早完成项和当前等待项，这是不同事项，不抹掉旧完成。
- 中心铃铛计事项数；项目/会话 badge 对 session/family 去重，running 指标仍由原 running owner 提供，可同时呈现运行与待查看，不能用 running 图标遮掉旧待查看。

### 2.3 快照版本

- 持久化 `instanceId`，绑定当前 agent 目录；一个进程/独立 agent 目录是支持的实例边界，不支持共用目录的多进程 writer。
- 服务启动生成 `epoch`；进程内全局 `sequence` 单调递增，完成 revision 跨重启不可碰撞。
- 快照含 instanceId/epoch/sequence、紧凑事项、必要计数索引与 storage/sync health。
- 同 epoch 只接受不小于已提交 sequence 的响应；跨 epoch 只能由当前重连/快照请求 generation 接管，不能被迟到旧响应切回旧 epoch。
- 暂时断线保留上一份快照并显式显示旧状态，不清空列表伪装“没有待办”。

## 3. 实际 run 识别与候选提交

参考 `research/completion-contract.md`，只用 SDK 公开接口：

1. loader 创建前初始化 tracker，装配 named/hidden 的 Web-only observer；普通和 Chat-only 都可观测，但 observer 不发现资源、不注册工具、不改变 prompt，subagent 始终抑制通知。
2. observer 同步注册，turn_end 记录 outcome/messageEntryId，before-settle 记录辅助 witness；返回 undefined，不返回 entries/continue、不发送消息或 append。
3. 实际 agent_start 建立 run；同一 settled 前的重试/continuation start 不重复编号。preflight、prompt_done、独立 bash 不制造候选。
4. Stop/watchdog/公开 abortHandler 在 abort 前给当前 run 留停止标记；openAsk 成功时留 askPaused，避免用户快速回答导致暂停证据消失。
5. settled 冻结该 run 及对应结果，关闭 active identity；之后的 deferred 实际 run 使用新 identity。直接 prompt 的可归属 rejection 先 veto 再释放计数/尝试提交，不能沿用原先先 finish 后报错顺序。
6. 最终正常 outcome、有效结果 entry、无停止/ask/可归属 fatal 标记才创建候选。中间失败但最终重试成功允许；error/aborted/length 不作为普通成功。
7. registry identity、alive/closing、generation 和 deleting 守卫均通过后才提交；不能让旧 wrapper 晚到回调写新事项。
8. 原 Web Push/声音通道保持独立 owner，不因站内状态源新增重复 delivery；legacy 导入和重取快照不触发 push/声音。

**已接受限制**：无 runId 的特殊扩展收尾错误可能无法 veto 正确候选。普通被 SDK 捕获的辅助扩展错误不是模型最终失败。不能用延时或撤回声称严格覆盖，不能扩大到 SDK patch。

## 4. 完成持久化与命令事务

- 建议文件 `<getAgentDir()>/pi-web-notifications.json`，0600 私有原子替换，复用 `writePrivateFileAtomicSync()`；新文件保存 version、instanceId、最新未查看完成和最小去重/迁移 watermark，不保存已读正文历史。
- 服务端正常情况下：形成候选 → 校验/原子提交 → 发布新 sequence；浏览器不在线也采集。
- 完成事件写失败不能让 agent 抛错或丢掉当前已收集候选：保留有界 dirty 状态、广播 degraded health、退避重试；不把它标为已持久化。
- ack/导入命令原子写成功才返回“成功”；失败保留原完成项，返回明确错误供重试，客户端不乐观移除。
- 初始损坏/未知版本文件保留原文件、报告异常，不静默覆盖唯一数据；同目录原子替换失败可回退内存但须显式降级。补救与日志不暴露摘要/私人内容。
- 单进程序列化所有写入；重试写当前最新状态，不能用旧快照覆盖后来的完成/ack。
- 正常重启恢复已提交记录与 revision。进程崩溃前未提交 dirty 状态不保证恢复；不建 exactly-once journal。

## 5. Pending 聚合与生命周期

- 存活 wrapper 的 pendingAsk 与 extension pending 为权威，包含“没有 ask”的否定状态，覆盖失败清盘后遗留的磁盘项。
- 没有存活 wrapper 时 ask 使用 loadOpenAsks 的镜像回退，不重建 wrapper；启动时一次加载并用原 open/close 事件更新缓存，不每 2 秒全盘读所有问题。
- 请求 open/close、custom register/render/close、timeout/abort、wrapper destroy/replacement 在原 owner 提供窄通知 invalidation/snapshot 接口。
- inactive/closing wrapper 的普通 extension 请求失效；等待项只在能被原会话处理时呈现。ask 镜像保留符合其原生命周期，不被全局订阅清掉。
- 不订阅每个会话的原 SSE。可参考 pending UI replay 及订阅→缓冲→快照顺序，但聚合接口本身不创建会话。
- 删除路径以 deleting session 集合抑制晚事件；清理成功 unlink 的会话及实际删除后代。失败/部分成功则按实际存在状态恢复或保留，不用父会话“一刀切”清全部 fork。

## 6. API 与实时同步

### GET `/api/notifications`

- 返回权威紧凑快照；只补通知涉及的会话元数据，定向读取且有并发上限/缓存。
- 不在每个 poll 做 force 全量 session 扫描；利用已有项目 identity/列表版本与runtime元数据。列表加载失败不能误判会话已删除。
- 缺失元数据有占位/重试，校验真正不存在后才清理幽灵项；标题/重命名/项目 key 更新不改完成 revision。
- `Cache-Control: no-store`；与现有 API 同样经过认证/host/origin 边界。

### POST `/api/notifications`

- `ack`：带 id + observedRevision。
- `ack_many`：调用时冻结已观察 completion id/revision 集合，有界分批处理；不提供“不带版本清空整个服务器集合”的命令。
- `import_legacy`：有界 sessionIds 与 instanceId，用于 R3 迁移。
- JSON/content-type/大小、字段、长度、批量数及请求来源校验；pending id 不能当 completion ack。
- 比较版本后仅删除匹配项；重复/已删除/旧版本是幂等 stale/noop，返回当前版本状态；旧操作不得清新完成。
- 各批失败允许重试剩余冻结条目，不能把 UI 的部分成功显示成全部成功。

### GET `/api/notifications/events`

- 每文档仅一条全局轻量 SSE，发送 connected/invalidation/health，不投递完整 transcript。
- 先订阅并缓冲，再发送当前快照版本，之后放行；合并 burst invalidation，监听者错误不阻断其他订阅。
- 所有 handler/请求校验连接 generation；断线重连与 online/visibility 恢复拉权威快照。
- 可见状态采用约 2 秒轻量版本/快照兜底，覆盖半开 SSE，目标在正常网络下 ≤3 秒；不每次重算所有元数据。隐藏时暂停轮询，前台立即 reconcile。
- 关闭/卸载释放 stream、timer、AbortController、listeners；不续 agent idle 生命周期。

## 7. 已查看与跳转证据链

1. 通知点击调用 AppShell 已有显式会话选择/项目采纳路径；目标元数据用单会话查找，URL/记忆优先级不变。点击不发送 ack。
2. hook 发布独立 committed-history snapshot：sessionId、viewGeneration、loadedLeafId、ready、durableEntryIds；只有胜出请求提交后 ready。切换/分页/缓存恢复不能把旧 entry 数组套进新 leaf。
3. 结果定位使用通知的 resultEntryId。在当前分支按需分页并确保目标 DOM 挂载；不拿 transcript snapshotRevision 当通知 revision。
4. 为完成结果增加唯一 marker；同一 assistant 同时出现在过程与答案时，只标记实际结果区域。没有可显示终态内容时不以空元素/尾部sentinel冒充。
5. IntersectionObserver 的 root 是聊天滚动容器；交集后再核验 document 可见/焦点、结果区域实际可见、滚动恢复结束、reading-surface-active（无中心/设置/全屏文件/阻塞对话框覆盖）。
6. 分支只要求当前 committed 分支包含 resultEntryId，允许其后有新子节点；兄弟分支不能 ack。busy 时不 navigate_tree，目标在其他分支则提示使用现有分支导航/稍后查看，保持未读。
7. 发观察时固定的 completion revision；响应只合并更高 snapshot版本，R1 ack 不影响 R2。切 session/branch、卸载、切换面板或新 revision 都撤销旧 observer。
8. 观察失败不自动补清；“全部标为已查看”是用户明确动作，可处理无法定位的旧项。

## 8. UI 集成

- AppShell 的顶层入口不放进依赖 showChat 的 toolbar；复用互斥 top-panel owner，确保未选会话和小屏主工具栏都可访问。
- 桌面浮层锚定真实对话列：以 `AppShell` 工具栏下对话内容列 DOM 的 `getBoundingClientRect()` 为坐标，取该列与 viewport 的12px padded bounds交集，`width = min(460, max(0, rightBound - leftBound))`，`left` 将 `columnCenter - width/2` 夹在该交集中，`top = columnTop`（工具栏下方）。有效可见正宽列禁止280px等最小宽度floor撑出边界；无锚点/零宽/完全离屏才视口居中兜底。不可容纳两侧间距的纯输入返回零宽，不冒称控件可用性；真实resizer稳态最小列的证据另记。`NotificationCenter` 用 `ResizeObserver` 观察该列并监听 `window resize`，cleanup 字面成对，SSR/首帧不读 window，未测量时以 CSS 视口居中兜底。手机 ≤640px 全屏（含 `transform: none`），header safe-area、44px 关闭目标、受约束滚动链、focus-return，Escape 优先关闭中心而非停止 agent。
- 纯摘要列表：等待交互组、完成待查看组，行显示项目/会话/类型/时间/截断纯文本摘要。长列表窗口化/按需渲染，不将所有历史会话 DOM 挂载。
- 批量按钮仅在有完成项时可用，动作文字明确“不处理等待输入”；连接/存储降级提示与错误重试保留。
- 中心和侧栏从同一 snapshot 推导事项/计数。删除原 local unread setter及运行差分标记，不去掉原 running poll 的运行状态/结构刷新职责；完成音回调保留单一触发和原设置。
- 新文案同时覆盖 en/zh-CN/zh-TW。中心是全局工具表面，不直接套聊天字号 offset；涉及真正对话结果的新 marker不改原排版/字体契约。

## 9. 兼容迁移

- 从浏览器现有 key 读取有界字符串 id，等待服务端返回 instanceId 后提交；服务端核验会话存在、所属实例及subagent抑制。
- 只导入尚未在服务端处理过完成/迁移的 session；保留最小 per-session watermark防止另一设备的旧 key 把已查看记录复活。
- 新服务端 live 完成优先于 legacy；迁移不覆盖更新revision，也不触发系统通知或声音。
- 迁移成功后移除旧集合，并写实例作用域迁移标记；失败保留旧 key 以便重试，不再同时作为实时权威源。
- legacy 不推断成功运行/精确runId；能从已保存可见历史定位结果才绑定 entry，无法定位则保留显式可标查看项。时间/摘要注明来源，不凭mtime声称精确完成时刻。
- 不重扫历史 transcript 建通知；未连接过的旧浏览器只在其首次访问新机制时导入本机标记。

## 10. 风险与回退

- 已接受 SDK 特殊异常限制，及 ask best-effort 镜像、普通 extension 请求不可跨重启恢复。
- 3 秒标准限定健康网络与在线可见设备；系统挂起、故障存储、服务器过载不伪称达标。
- SDK boundary observer 属于兼容敏感接点，必须用锁一致真 SDK 离线 provider 测试，而非只发空 settled mock。
- 回退代码不删除新私有通知文件/ask镜像；停止消费后旧 UI仍需明确其本地范围。由于新旧机制语义不同，不承诺自动双写回退；回退前保留状态文件并记录操作。
- 验证仅在隔离 HOME/PI_CODING_AGENT_DIR 与独立 checkout 中执行；不对 live agent 数据做写入。
