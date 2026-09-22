# Implement：会话停滞看门狗

## 0. 前置

- 先读本仓库 `AGENTS.md`（25K，含本项目开发约定）与 `CONTEXT.md`。
- 工作区有**未提交改动**（`.pi/agents/trellis-{check,implement,research}.md` 的 frontmatter）：不要覆盖、不要顺带提交。
- 本仓库**没有** `.changeset`；发布走 `.github/workflows/release-personal.yml`，无需 changeset。
- CI 门禁顺序：`npm run lint` → `npx tsc --noEmit` → `npm test`（e2e 另跑 `npm run build && npm run test:e2e`）。

## 1. 实现清单（有序）

1. 读 `lib/rpc-manager.ts` 的 `start()`（`:340-358`）、idle 计时器（`:139`/`:354`/`:623`/`:1207`）与 `case "abort"`（`:834`），确认观测点、清理点与可复用的中止序列。
2. 新增看门狗模块（独立文件，便于单测）：维护 per-session `lastEventAt`，暴露 `observe(event)`、`effectiveTimeoutMs(toolName)`、`arm()/disarm()`；阈值解析写成导出函数（env 优先、默认、`0` 关闭、非法回落 + warn），语义对齐 `resolveSessionIdleTimeoutMs()`（`:156`）。
3. 接入 `AgentSessionWrapper.start()` 的 subscribe 回调：喂 `observe()`；用 `activeToolEvents`（`:247`）判断最后 in-flight 工具；命中时走 `case "abort"` 的既有序列并带上原因。
4. 补发一次可读的停滞事件 + 日志（R4/R7）：显示通道先对齐 `.trellis/spec/frontend/trellis-subagent-records.md` 的契约（`lib/trellis-subagent-records.ts` 投影层/会话记录），不新造平行通道、不把扩展代码导入浏览器。
5. 生命周期收口：`agent_settled`/`agent_end`、用户 abort、`destroy()`（`:1207`，与 `idleTimer`/`activeToolEvents` 同处清理）都要停表，且触发幂等（R6）。
6. 配置层：在 `lib/ask-user-settings.ts` 同族的 settings 读写中加 `stallTimeoutMs` / `stallToolTimeouts`，保持 `PI_WEB_*` env 优先；如需要设置 UI，沿 `app/api/settings/ask-user/` 的范式加路由。
7. 测试：AC1–AC4 → `lib/rpc-manager-stall-watchdog.test.mjs`（`node:test` + `jiti`，可控时间推进）。
8. 文档：本仓库相关 README/文档补键说明（默认值、关闭方式）。
9. **（返工追加）R4 持久化**：在 `lib/message-display.ts` 定义 `STALL_ABORT_CUSTOM_TYPE = "pi-web.stall.abort"` 与 payload 类型；`lib/rpc-manager.ts handleStall()` 在 `abortTurn()` 之前 fire-and-forget 调用 `this.inner.sendCustomMessage({ customType, content: <英文一句摘要>, display: true, details: <stall payload> }, { triggerTurn: false })`，`.catch` 只记日志（写入失败不得影响中止）。
10. **（返工追加）本地化渲染**：`components/MessageView.tsx` 的 `CustomMessageView` 对该 customType 走 `formatStallAbortNotice(details, t)`，不显示裸 JSON details。
11. **（返工追加）测试**：看门狗单测断言 `sendCustomMessage` 的调用参数（含 `triggerTurn: false`）；`formatStallAbortNotice` 已有测试继续覆盖；补一条组件/源码断言测试确认 `CustomMessageView` 对该 customType 输出本地化文本；AC5 驱动补一步：跑完读会话 `.jsonl` 断言 `custom_message` 条目与 `details` 字段。

## 2. 验证命令

本仓库（= CI 门禁顺序）：

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build && npm run test:e2e   # 需要时
npm run dev                         # next dev -H 127.0.0.1 -p 30141
```

端到端（在 `/home/xupeng/dev/personal/personal-assistant`）：

```bash
# 1) 以极小阈值跑改动后的 pi-web（env PI_WEB_STALL_TIMEOUT_MS 或配置文件）
# 2) 派发一个耗时 > 阈值的真实 trellis_subagent
# 3) 观察：会话自动中止 + 原因可见
pgrep -f 'pi --mode json'   # 期望：无遗留子进程
```

## 3. 风险文件与回滚点

- `lib/rpc-manager.ts`（2365 行，核心会话运行时）：改动集中在 subscribe 回调与计时器管理；不动 `case "abort"` 既有语义、不动 `destroy()` 清理顺序、不动 `subagent-*` 内置子代理路径。回滚点 = 只撤看门狗接入调用。
- `lib/ask-user-settings.ts` 同族 settings 读写：新增键必须保持「旧配置文件可用、非法值不阻塞启动」。回滚点 = 撤键 + 撤看门狗默认开启。
- 定时器泄漏是最可能的回归面：清理必须覆盖 `destroy()`（`:1207`）与 turn 结束两条路径。

## 4. 交付前检查

- [ ] AC1–AC4 单测通过；`npm run lint` + `npx tsc --noEmit` + `npm test` 全绿。
- [ ] AC5 端到端实跑通过（含 `pgrep` 无遗留子进程）。
- [ ] 默认阈值下 AC6 人工回归未被中止。
- [ ] 显示层改动符合 `.trellis/spec/frontend/trellis-subagent-records.md` 的契约。
- [ ] AC7：停滞中止后会话 `.jsonl` 存在 `custom_message`（`pi-web.stall.abort`），刷新后渲染为本地化可读原因，且未额外触发 turn。
