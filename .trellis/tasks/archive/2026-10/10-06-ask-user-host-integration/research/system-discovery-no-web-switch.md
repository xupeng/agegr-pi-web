# SDK 自动发现，删除 Web AskUser 开关（2026-10-06）

## 用户决定

“自动发现系统安装的工具，就可以移除 web 开关了”。这是专用启用控制的明确删除，不是把按钮藏起来但保留 API/env。系统工具 + Web/TUI 并立 host 的上一决定不变；仍 planning，未获本版最终实现审批。

## 当前代码锚点（只读）

- lib/ask-user-settings.ts:18-40：读写共享 pi-web-settings.json.askUser，PI_WEB_ASK_USER 优先，再 persisted/default；extension.ts:2,27 消费 gate。
- app/api/settings/ask-user/route.ts：GET 返回 effective/persisted；PUT 校验并写配置。移除路由/helper，不保留 enabled:true facade。
- components/SettingsPanel.tsx:92-97：ask 状态；:124-160 请求、toggle、reload handler；:532-559 专用 General section 与提示/按钮。仅删 ask 专用流程，其他 pane/session reload 不受影响。codegraph 标记该文件 stale，已 read 当前范围校正。
- lib/i18n/messages/{en,zh-CN,zh-TW}.ts:477-478：settings.askUserTitle/settings.askUserDescription，三语一起删；chat.askUser* 和 agents.reload* 是仍有消费者的表单/共享文案，不删。
- lib/ask-user-settings.test.mjs、lib/ask-user/extension.test.mjs：旧 env/preference 行为用例，改为删除后退役与 installed discovery 回归，不能继续断言 Web env 优先。
- lib/pi-web-settings.ts：共享 helper 读 Record<string,unknown> 并保留未知字段。旧 askUser 字段无需物理迁移，停止消费即可；不能顺手删除共享 helper 或破坏其它字段。

## 目标语义

1. 可用性来自 SDK 正常发现、原 packages/extensions/工具状态及主会话执行边界，无 AskUser 专用 Web enabled snapshot。
2. 正常主会话注册 bridge-only host，外部工具自己执行；不另行注册/安装/锁定工具。
3. model-only 防脚本吞 terminate；Chat-only/子代理不获得主会话能力。这些是执行契约，不是替代开关。
4. 发现不等于强制激活。defaultActive:false、inactive/hidden、用户原 SDK 资源过滤与工具选择保持权威，reload/navigation 不复活它们。
5. 旧 askUser:false 与 PI_WEB_ASK_USER=0 不再禁用 SDK 已激活的工具；旧字段作为 unknown 留在文件，真实配置不写。API/UI/helper/env 控制通道全部退役。
6. 未安装时不提供工具，Web 正常启动；旧 pending 展示与关闭不要求当前工具 active。系统资源变化使用原 SDK reload，不再需要专用 General 提示。

## 验收证据

- 隔离实际系统包 discovery：旧字段 false/env 0 + SDK active 仍能发问，source 仍是系统安装，bridge 一次，Web 不打开 TUI。
- 无包、SDK 资源过滤、inactive/hidden、Chat-only/child、多来源与 bad version/ack 的原边界仍成立，不 fallback/强制 active。
- General 页面实际浏览器证明开关/专用 reload 不存在、不 fetch 旧 API；其它设置正常。静态断言不等于此浏览器证明。
- API/helper/旧 env 消费移除；三语 keys 一致、表单/共享 reload 文案保留；其它设置原子读写/未知字段测试继续绿。

本轮仅源码只读核查与规划更新，无 task start、产品编辑、配置写入、安装、模型请求或服务操作。
