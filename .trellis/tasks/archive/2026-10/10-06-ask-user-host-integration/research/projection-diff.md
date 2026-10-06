# AskUser portable 与 Web 投影核查（2026-10-06）

## 证据与范围

核查外部源 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`、本仓库 `lib/ask-user/portable` 与 React view。此报告是代码/配置证据，不是浏览器验收；当前未运行真实表单链路。

全局 `/home/xupeng/.pi/agent/settings.json` 的 packages 包含 `../../dev/personal/pi-extensions/pi-ask-user`。外部入口 `index.ts:26-31` 注册 bridge-backed tool，只有 `ctx.mode === "tui" && ctx.hasUI` 才允许 native fallback。当前工具报错 `expected exactly one synchronous host bridge on "pi.ask-user.bridge:resolve-open:v1" (got 0)`，符合非 TUI 无 bridge 的 fail-closed 行为。具体 loader 和重复工具顺序由 `loader-source-and-minimal-plan.md` 补充，不以配置单独推断最终 owner。

最新用户澄清：直接使用系统已安装版本，Web/TUI 投影并立；固定 npm dependency 提案已撤回。表中路径是当前证据锚点；Web 去掉重复可注册工具，保留 host 的协议/校验/状态/UI 职责。外部包不包含 React view，不保留本地工具 fallback。验收以最新 design/implement 为准。

## Portable 差异（逐文件 diff）

- `types.ts`、`validation.ts`、`format.ts` 当前与 Web 对应文件字节相同：DTO、问题与答案上限、单/多选校验、unanswered/supplement 格式没有变化。
- 外部 `tool.ts:134-158` 与 Web `portable/tool.ts:134-165`：外部改为通用 UI 文案，`deps.open` 新增 `ExtensionContext` 参数；外部缺失 Web `portable/tool.ts:139` 的 `exposure: "model-only"`。后者不是显示差异：若外部工具成为运行时 owner，会改变 codemode 的可调用与 terminate 边界，需要真实 SDK 回归。
- 外部 `bridge.ts:91-139`：仅当零注册时使用显式 fallback；invalid registration、多个 host、host 拒绝/畸形 ack 仍 fail closed。Web 现有 `extension.ts:25-35` 直接注入 open，未监听此 channel。
- 外部 `index.ts:24-31` 总是建立 native adapter 并注册工具；Web 不应靠设置 `hasUI` 或模拟 TUI 来解决缺失 host。

## 行为投影表

| 新版/共用行为 | Pi Web 当前落点 | 任务处理 |
| --- | --- | --- |
| 发问后非阻塞终止本轮，回答同会话续跑 | Web tool + wrapper，spec 的既有契约 | 修复加载/bridge 使该链路可达，并集成验证 |
| 单选、多选、自定义、可跳过全部问题、supplement | `portable/view-controller.ts:55-83,131-145`、React view | 保持；DTO/validation/format 相同 |
| model-only，不允许嵌套脚本吞 terminate | Web tool 已声明；外部 tool 未声明 | 必须保留 Web 边界；不能只加 bridge 就宣布修复 |
| 关闭/提交、错误解锁原地重试 | `portable/react/AskUserView.tsx:132-146`、Web API/hooks | 保持并验收 |
| pending ask 跨 reload / wrapper 重建 | Web persisted pending state + hook state hydration | 保持现有机制；不以 TUI 记录替代 |
| 终端页式表单、Tab/方向键分页、Escape defer、footer | `tui-host.ts:165-234,299-358` | TUI 专属；浏览器保留现有非模态表单，不逐键移植 |
| TUI 草稿按当前分支持久化，fork/tree 恢复 | `tui-host.ts:236-276`；Web view 在 `useReducer` 内初始化，`ChatWindow.tsx:949` 按 askId 重挂载 | Web 未等价实现；不误报为全功能一致。跨 host/branch 草稿迁移不属于最小接入修复 |
| TUI 自定义多行编辑 | Web 自定义答案 `AskUserView.tsx:253` 是单行 input，supplement `:287` 是 textarea | UI 能力不同，不因 host bridge 修复自动变多行 |
| TUI durable outbox / retry 与写失败 repair | `tui-host.ts:72-95,138-163,304-350` | Web 仍按既有 best-effort 镜像与 fire-and-forget follow-up；不在此任务悄然扩展可靠交付保证 |
| 从 TUI 打开含 native pending/outcome 的历史会话 | `pi.ask-user.tui.*` session entries 与 Web pending-ask 镜像不是同一 store | 不承诺跨 host 原生 pending/draft 自动迁移；单独披露 |

## 既有可靠性边界

`.trellis/spec/frontend/ask-user-protocol.md` 明确 Web 镜像写失败仅记录日志，内存态仍权威，回答 sendCustomMessage 为 fire-and-forget。这与 TUI 的存储修复/outbox 不等价；最小 bridge 接入不应借用 durable 一词宣称新增原子/恰好一次保证。正常路径要验证镜像与 UI 已就绪；错误路径不得新增假成功。若用户要求与 TUI 完全相同的可靠性或跨 host 草稿恢复，需要扩展 PRD 并重新审批。

## 外部研究快照

SHA-256（只读源版本识别，不引入机器绝对路径为产品依赖）：

| 文件 | SHA-256 |
| --- | --- |
| index.ts | `0354e93b13d3e09d5fb22e9bf23d5e0c0b897607bc67b9b389d6262e30e596e3` |
| tool.ts | `af64e24c6751d0302e22d4f8fd68d33f2a6e64d258f81ba8c076fe9df56e28af` |
| bridge.ts | `da00495c4ef01705f9a6d11e5124adeafc3a458c426b1b0738808717098abe8c` |
| types.ts | `49b668c5595113ca4a8436e1a575adf3c893907fcb456c5a0982f965690009e9` |
| validation.ts | `60a62e9a049049b174484c51a9757ac80499a13776d6904bad2f7cd76a4f2158` |
| format.ts | `b0cae45f07111d4c22303123d5b723a1810146fde4a2c644adff5a90710ae3ce` |
| tui-host.ts | `b4ce9158e07360575ee5231553250b0367936025be3ae26d7e62436188b99c71` |
