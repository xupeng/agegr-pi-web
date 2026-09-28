# 修复对话区抖动与输入框错位

## Goal

运行中的对话不应因滚动条或动态内容变化发生可见的横向抖动；消息列应始终与下方输入框对齐。

## Background

- 用户提供的桌面截图显示，运行中的消息内容和输入框存在横向偏移；尚无稳定的人工复现步骤。
- `components/ChatWindow.tsx:1039-1050`：消息列与 36px 的 `ChatMinimap` 并排，滚动容器设有 `scrollbar-gutter: stable`；`app/globals.css:478-480` 规定桌面 Chromium 滚动条宽 10px。
- `components/ChatInput.tsx:1838-1862`：输入框为小地图预留右侧 36px，但未预留滚动条槽位。固定槽位可能造成中心线差异，具体成因须由浏览器尺寸测量确认。

## Requirements

- 保持消息列与输入框的左右边界及中心线一致，不因滚动条显示状态、会话内容增量或运行状态变化而跳动。
- 不改变消息滚动、小地图、输入框发送和移动端布局的既有行为。
- 为发现的布局原因添加可复跑的回归验证；真实浏览器测量与源码断言分别报告。

## Acceptance Criteria

- [x] 桌面端长/短对话、运行中内容增长和滚动状态切换时，消息列与输入框的左右边界在浏览器实测中保持对齐且无横向跳变。
- [x] 移动端不存在新增的水平溢出或输入框错位；小地图与滚动条仍可正常使用。
- [x] 对根因有尺寸测量或等效可重复证据，回归测试可在现有测试体系中执行。

## 验收结论（2026-09-28）

修复经 [#18](https://github.com/xupeng/agegr-pi-web/pull/18) 合入 `personal`（修复提交
`5ddd4e7`，合并提交 `134de42`），证据见 `research/verification.md` 与
`research/browser-geometry.md`。

- **根因**：滚动列 `[scrollbar-gutter:stable]` 保留了真实滚动条槽位，而 composer 的右
  内边距只预留了 36px 小地图。`components/ChatWindow.tsx:762-775` 现在把
  `offsetWidth - clientWidth` 写入根节点 `--chat-scrollbar-gutter`，
  `components/ChatInput.tsx:1844` 据此增加右内边距，小地图轨道在不可见时改为占位而非
  返回 `null`（`components/ChatMinimap.tsx:640-643`）。
- **浏览器实测**（真实 Chromium）：1280px 长/短会话 `337..1157`，800px `276..738`，
  390px 普通指针 `16..364`、触屏 `16..368`；滚动到底、短会话从不可滚动变为可滚动、
  触屏指针切换前后横坐标不变，`documentElement` 无水平溢出。
- **回归验证**：`e2e/chat-appearance.mjs` 的 `checkChatColumnAlignment()` 同帧比较消息列
  与 composer 的左右边界；`e2e/run.mjs` 在长/短会话、滚动到底、800px 窄桌面、390px 触屏
  与内容展开前后调用它。
- **未覆盖项**：这些新增断言尚未在完整 `npm run test:e2e` 套件中跑到——本 checkout 的
  8505 服务持有 `.next/dev/lock`，`e2e/run.mjs` 禁止并发启动服务，因此真实浏览器测量改
  用指向该服务的只读脚本完成。上述测量只走读取路径，未向任何会话发送消息。

## Out of Scope

- 不修改消息渲染内容、服务端流事件语义或输入框交互设计。
