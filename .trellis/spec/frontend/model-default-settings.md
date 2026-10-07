# 模型默认设置

## 1. 适用范围

同步上游 #871 后，普通模型/思考等级选择只影响当前会话；只有显式保存默认值才修改全局设置。
写入归 `app/api/models/default/route.ts:51` 与 `lib/default-preferences.ts:52`，浏览器提交归 `hooks/useAgentSession.ts:2398`。
启动路径不再调用已删除的 `startup-preferences` 模块。

## 2. 签名

`PUT /api/models/default` 接收 JSON 对象；模型字段必须成对提供，至少有一种编辑：

```ts
interface DefaultPreferencesRequest {
  cwd?: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
}

declare function writeDefaultPreferences(settingsManager: SettingsManager,
  edit: { model?: { provider: string; modelId: string }; thinkingLevel?: ThinkingLevel }
): Promise<void>
```

`ThinkingLevel` 允许 `off/minimal/low/medium/high/xhigh/max`（`lib/default-preferences.ts:6`）。

## 3. 契约

- `cwd` 默认 `process.cwd()`，必须是存在且通过共享文件允许表/真实路径授权的目录。
- 成功响应 `{ ok: true, defaultModel?, defaultThinkingLevel? }`，只返回实际编辑的字段；写入后失效模型缓存。
- 项目 `.pi/settings.json` 的对应键遮蔽全局值时返回 `409`，不谎报写入成功；`settingsPath` 和 `keys` 指出覆盖来源。
- 模型必须出现在当前 cwd 的 SDK 模型 scope 中，不能通过保存默认值绕过 `enabledModels`。
- `writeDefaultPreferences` 先检查 global load error，再调用 SDK setters、`flush()` 并检查 `drainErrors()`；失败不得返回成功（`lib/default-preferences.ts:56`）。
- 全局模型默认与保存的思考等级标记独立于当前会话值；`GET /api/models` 的 `savedDefaultThinkingLevel` 用来显示保存标记，不等同于 scope 的有效思考等级。

## 4. 校验与错误矩阵

| 情况 | 响应 |
| --- | --- |
| 非法 JSON、非对象顶层值（包括 null/数组）、缺失成对模型字段、非法 thinkingLevel、空编辑 | `400` |
| cwd 不存在或不是目录 | `400` |
| cwd 不在允许的真实路径内 | `403` |
| 项目设置覆盖本次键 | `409 { reason: "project-scope", settingsPath, keys, error }` |
| 模型不在当前 scope 的可用列表 | `404` |
| SDK 加载/写入/flush 错误 | `500 { error }` |

请求字段校验由 route 唯一负责；项目键检查和 SDK 写入由共享 helper 负责。

## 5. 正常、边界、错误案例

正常：当前会话选模型 B 不改变全局模型 A；显式保存 B 后，下次新会话的默认才改变。
边界：项目只覆盖思考等级时，保存模型不被无关字段阻止；同时编辑模型和思考等级，则需检查全部编辑键。
错误：全局 settings 加载损坏或写盘失败时 SDK 会收集错误而非立即抛出，helper 必须 drain，不能返回假成功。

## 6. 必测断言

- `lib/rpc-manager.test.mjs:531`：源码回归断言启动路径不调用全局默认写入；它本身不证明所有运行时启动变体。真实 SettingsManager 写入行为由下面的 helper 用例覆盖。
- `lib/default-preferences.test.mjs`：合法等级、项目遮蔽键、真实 SettingsManager 写入与 flush/load error。
- `components/ChatInput.test.mjs` 与 `hooks/model-loading.test.mjs`：保存控件仅在 composer，保存标记与当前选择分离。
- `app/api/models/default/route.test.mjs`：顶层 null、数组、原始值及非法 JSON 必须返回受控 `400`，不能在校验前访问字段抛错。
- route 的输入拒绝不能触碰真实用户设置；测试使用独立临时 agent/cwd。

## 7. 错误与正确方式

错误：在 `startRpcSession` 中把浏览器一次会话选择写成全局默认值，或全局 SDK setter 后立刻响应成功。
正确：当前会话选择沿原有 session 设置路径；只有显式 `PUT /api/models/default` 验证权限、scope 和项目遮蔽，再等待 flush 与错误检查。

当前会话的 cold `set_model` 用户intent需要标准SDK `model_change`持久化后发布wrapper；这不是写全局默认值。子代理exact选模/可信扩展/执行scope和拒绝契约见[子代理选模与可信扩展](./subagent-model-selection.md)。
