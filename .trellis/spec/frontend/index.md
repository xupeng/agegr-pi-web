# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

本目录是前端开发的约定集合，写给**未来接手这个仓库的 AI 与新人**：每条规则都指向真实文件，说明这个仓库实际怎么做，而不是通用的最佳实践。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 真实目录树、新代码落位决策表、命名约定、客户端/服务端边界、路径别名、e2e 两类脚本 | Written |
| [Component Guidelines](./component-guidelines.md) | 文件解剖与客户端边界、Props 约定、组合与数据流、i18n、样式与字号变量、可访问性、组件测试、常见错误 | Written |
| [Hook Guidelines](./hook-guidelines.md) | Hook 清单（11 文件/13 导出）、参数与返回值、依赖与 cleanup、模块级订阅、命名、测试、陷阱 | Written |
| [State Management](./state-management.md) | 状态落点分类、跨组件共享四种机制、服务端状态、URL 状态、localStorage 持久化、SSR/Hydration、陷阱 | Written |
| [Quality Guidelines](./quality-guidelines.md) | 门禁基线、禁止/必须遵循的模式、测试要求、Code Review 清单（另含"验证基线必须来自与锁文件一致的依赖树"） | Written |
| [Type Safety](./type-safety.md) | tsconfig 实际严格度、类型归属、运行时守卫、常见写法、禁用写法 | Written |
| [Trellis subagent execution snapshots](./trellis-subagent-records.md) | Single owner for exact tool/kind gate, bounded branch API projection, evidence/watermarks, scoped hook ownership and read-only UI | Written |
| [ask_user 提问协议](./ask-user-protocol.md) | ask_user 工具契约、状态机、事件/命令协议 | Written |
| [移动端键盘与视口高度](./mobile-keyboard-viewport.md) | useViewportHeight 机制、focus 重试、WKWebView 兜底 | Written |
| [会话列表刷新机制](./session-list-refresh.md) | 两级按需加载、缓存层级、刷新触发点、强制刷新竞态防护 | Written |
| [设置弹窗在移动端的布局协议](./settings-dialog-mobile.md) | 小屏全屏化、margin auto 居中、safe-area 陷阱、滚动链、对话区字号与内容宽度模式 | Written |
| [Clickable file paths](./clickable-file-paths.md) | Turn written-file extraction (apply_patch / trellis / Agent 快照)、索引校验链化、`PathText`、产物卡片与打开授权 | Written |
| [会话停滞看门狗](./stall-watchdog.md) | 阈值来源与优先级、工具级宽限、`stall_aborted` 事件契约、arm/disarm/dispose 不变量、与 idle 回收的边界、已知边界 | Written |

---

## 写作约定

新增或更新本目录文档时的硬要求：

1. 写**代码实际怎么做**，不写理想做法；有技术债就如实记录，改进另开话题。
2. 每条规则指向真实文件（`path:line`）；允许短片段，禁止大段粘贴代码。
3. 列出**禁止的模式**与**常见错误**，并说明原因。
4. 模板不适用的 section 直接删除，不留空标题、不留占位文字；主题不同就拆分或合并文件。
5. 新增文档必须在上面的索引表登记，并保持 `Status` 列准确。
6. 写完自查：`grep -rniE 'To be [f]illed|TODO: [f]ill' .trellis/spec/` 必须零命中（用字符组避免命令本身被匹配）。

---

**语言**：正文用中文；代码标识符、文件路径、命令保持英文原文。既有的英文文档（`trellis-subagent-records.md`、`clickable-file-paths.md`）保持英文，不做强制改写。
