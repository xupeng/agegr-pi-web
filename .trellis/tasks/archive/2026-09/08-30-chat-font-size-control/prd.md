# 设置中可调对话区字号（相对缩放）

## Goal

在设置面板「常规 → 外观」中新增对话区字号控制，以当前默认字号为基准相对放大/缩小（offset 档位，非绝对字号设置），仅影响对话消息区（markdown 正文），不影响侧边栏、输入框、设置面板等其余界面。

## Requirements

- 新增设置项「对话区字号」：`-` / `默认` / `+` 按钮（参考 banban `SettingsFontSizeControl` 交互），实时显示当前偏移与生效实际字号。
- 字号为相对偏移（默认 0 = 当前字号），范围 clamp 在 `[-4, +4]`px（参考 banban `TIMELINE_DETAIL_FONT_SIZE_OFFSET_MIN/MAX`），数据经 normalize 函数校验，localStorage 存 `pi-chat-font-offset`（读取失败/越界回落默认 0）。
- 只影响对话区：作用于 `.markdown-body`（对话消息正文，含用户消息），**排除** `.markdown-file-preview`（文件预览）及界面其他区域。
- 响应式基础字号保持（15.5px / md 17px / lg 16px），偏移在此基础上叠加；行高按比例跟随（line-height 已是相对单位，随 font-size 自动缩放）。
- 字号偏好即时生效：设置面板修改后，已打开/新打开的对话会话无需刷新即可看到效果（storage 事件或自定义事件同步，参照 `useTheme` 的 useSyncExternalStore 模式）。
- i18n：zh-CN / zh-TW / en 三语新增设置文案。

## Acceptance Criteria

- [x] 设置面板「常规 → 外观」出现「对话区字号」控件，`-`/`默认`/`+` 可调，偏移越界时按钮禁用，默认值显示「默认」。
- [x] 调整后对话消息正文（助手/用户消息 markdown）字号实时变化，侧边栏、输入框、设置面板、文件预览字号不变。
- [x] 刷新页面后偏好保持；localStorage 损坏/越界时回落默认且不报错。
- [x] 响应式断点（窄屏 15.5px、中屏 17px、宽屏 16px）基础上叠加偏移仍生效。
- [x] 三语文案齐全；`tsc --noEmit` 通过；变更文件 lint 通过；新增/相关测试通过。

## Notes

- 参考实现：banban `src/detailFontSizePreference.ts`（存储+normalize）、`getTimelineDetailTypography`（字号/行高计算）、`SettingsFontSizeControl`（UI）。
- 本仓库对齐模式：`hooks/useTheme.ts` 的 localStorage + useSyncExternalStore；`lib/i18n/messages/{zh-CN,zh-TW,en}.ts` 文案。
- 应用方式：CSS 变量 `--chat-font-size-offset` 注入对话容器或 `.markdown-body` 上，`font-size: calc(var(--chat-font-size-base, 15.5px) + var(--chat-font-size-offset, 0px))`，三个断点分别定义 base。
- [x] 设置面板在移动端（iPhone）可完整查看并关闭：小屏全屏设置页、状态栏安全区、× 关闭按钮可见可点、内容可滚动；桌面/iPad 布局不回归。

- 轻量任务，PRD-only。
