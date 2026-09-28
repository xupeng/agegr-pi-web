# 浏览器几何回归调查

## 环境与运行方式

- `lsof -nP -iTCP:30141 -sTCP:LISTEN` 当前无监听，`.next/dev/lock` 不存在。此次未启动服务，也没有浏览器实测；下面的 5px 仅是待验证假设。
- 已安装 Playwright（`package.json`）。`e2e/run.mjs:21` 禁止在本 checkout 的 dev server 运行时启动自己的服务；`e2e/README.md` 说明它会自行启动 Turbopack、预置临时 `PI_CODING_AGENT_DIR`，结束时清理。已有服务时不可直接运行 `npm run test:e2e`，会争用 `.next/dev/lock`。不执行 `next build`。
- 复用服务：先检查 `lsof` 及 `GET http://127.0.0.1:30141/api/sessions`，用独立 Playwright 脚本 `chromium.launch()`、`page.goto()` 指向 30141，不 spawn Next；无服务时可按 `AGENTS.md` 以 `npm run dev` 启动唯一进程。若返回 401，当前实例启用了 `PI_WEB_PASSWORD`，页面需先经 `/login` 获取会话 cookie（`proxy.ts:42-79`）；现有 e2e 自启进程用 `PI_WEB_PASSWORD: ""`，不能假设现有服务也免认证。
- 工作区已有 `package.json`、`package-lock.json` 未提交修改与其他任务目录；本调查不触碰它们。

## 现有夹具与无副作用复现

- `e2e/run.mjs:26-49,64-153` 在临时 agent 目录写 session header 和链式 message，提供 5000 条的长会话和短/富文本会话；`:233-255` 以 1280x800、390x844 打开页面，等待 state 响应与最后一条消息挂载。`e2e/chat-appearance.mjs:35-113` 使用 `setViewportSize`、`getBoundingClientRect()` 和 `documentElement.scrollWidth <= innerWidth` 断言；`e2e/subagents.mjs:333-350` 示范精确路由拦截，避免真实 agent 执行。
- 已运行服务的 `PI_CODING_AGENT_DIR` 启动时固定，无法注入 e2e 的隔离会话目录。可先用真实长/短会话作只读 GET + 滚动测量，不向用户会话发送消息。确定性的动态内容增长需用隔离 agent 目录启动唯一服务并沿用 `run.mjs` 夹具，或为已有服务在独立浏览器上下文中 `page.route` 模拟有效的会话详情/context/state 与运行事件（先核对响应形状和 SSE 时序）。单纯在 DOM 手动插入节点只适合诊断静态 CSS，不等价于 React 更新的运行中回归。

## 采样与待证实根因

- `components/ChatWindow.tsx:95-96,1025-1038`：桌面滚动 div 为 `.chat-content .scrollbar-subtle.overflow-y-auto`，有 `[scrollbar-gutter:stable]`；直接子节点水平 padding 16px，下一层 `messageContentRef` div 宽度上限 820px 且居中。小地图并排宽 36px（`components/ChatMinimap.tsx:632-652`），但该组件的 `visible` 可使其返回 null，短会话要记录是否存在小地图。
- `components/ChatInput.tsx:1838-1855`：桌面 fieldset 左右 padding 16/52px（16px + 36px 小地图），内层居中 maxWidth 同为 820px。`app/globals.css:478-480` 定义 Chromium 滚动条宽 10px。若浏览器确实保留 10px 单侧 gutter 且两列均到 820px，消息中心可能比 composer 左移 5px；窄布局可能出现右边界差 10px。这不是测量结果。
- 在 `page.evaluate` 同一帧记录滚动 div、直接子 div、内容 div、fieldset 和其直接子 div 的 `getBoundingClientRect()`，以及滚动容器 `offsetWidth/clientWidth/scrollWidth/scrollHeight/clientHeight/scrollTop`、`getComputedStyle(scroll).scrollbarGutter`、小地图宽度、`documentElement.scrollWidth/innerWidth`。用 `offsetWidth - clientWidth - borders` 验证实际 gutter，勿仅断言 CSS 字符串。等待消息及两列可见后用 `requestAnimationFrame` 采样；比较左右界和中心（容差约 1 CSS px），还要比较状态前后的坐标变化。测 1280x800、2560x1100、390x844 的短/长内容、顶部/底部及动态增长；长会话确认 `scrollHeight > clientHeight`，小地图可用并能改变 `scrollTop`。移动端验证无水平溢出和输入框对齐。
- 分开报告真实浏览器测量值（viewport、坐标、实际 gutter、状态）与源码断言。修复后可将回归检查接入 `e2e/run.mjs` 的隔离长/短夹具；该脚本只能在 checkout 没有正在运行的 dev server 时运行。
