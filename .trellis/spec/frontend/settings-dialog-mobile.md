# 设置弹窗在移动端的布局协议

> 设置面板（`SettingsPanel`）与 config 浮层在小屏/刘海屏上如何布局，
> 以及踩过的坑（滚动链、safe-area、居中定位）。

## 小屏（≤640px）：全屏设置页，不用弹窗

- `@media (max-width: 640px)` 内 `.settings-dialog-surface` 全屏化：
  `width: 100vw; height: 100dvh; border-radius: 0; border: 0; margin: 0; max-*: none`。
- 原因：iOS 上 `100dvh`/`100vh` 受状态栏/底部工具栏影响会算出异常高度，
  有限高度弹窗的顶部标题栏/关闭按钮容易被顶出或遮住；全屏 + 安全区 padding 最稳。
- backdrop 同时 `padding: 0`；header 用 `padding-top: max(env(safe-area-inset-top), 0px)`
  把标题与控件放到状态栏（viewport-fit: cover 下约 59pt）之下。
- 全屏高度保留 `height: 100vh` fallback + `height: 100dvh` 覆盖
  （不支持的 webview 用 vh；键盘弹出时 dvh 动态收缩避让）。
- 桌面（>640px，含 iPad mini 竖屏 744pt）保持弹窗：`84vh` 居中 + tabs。
  断点与 `hooks/useIsMobile.ts` 的 `MOBILE_QUERY` 一致，勿改其一。

## 浮层居中：flex + margin auto（不要 align-items: center）

- `position: fixed; inset: 0; display: flex; overflow-y: auto` 的 backdrop
  配合子元素 `margin: auto`：空间充足时居中，元素高于容器时回落顶部对齐
  且容器可滚动查看全部内容。
- **禁止** `align-items: center` 居中固定尺寸弹窗：弹窗高度一旦大于可视区，
  顶部（含标题栏/关闭按钮）被顶出屏幕，用户既看不到 × 也点不到外部遮罩关闭。
- 同一模式同时应用于 `.settings-dialog-backdrop` 与 `.config-panel-root.is-modal`。

## safe-area 陷阱：absolute 元素不受父级 padding 影响

- `position: absolute` 相对的是 padding box 的**边框**，父级 `padding-top:
  env(safe-area-inset-top)` 不会把它推下来。`viewport-fit: cover` 下页面延伸到
  状态栏后面，绝对定位在 `top: 10px` 的关闭按钮会落进状态栏里不可见。
- 必须显式叠加：`top: calc(10px + env(safe-area-inset-top))`（桌面 env=0 无副作用）。
- 移动端关闭按钮至少 44×44pt 点击目标。

## 内容滚动链：overflow-y: auto 的元素必须有高度约束

- `.settings-general`（内容区）曾只有 `overflow-y: auto` 而高度随内容伸展
  （块级子元素无约束），永不溢出自身 → 无滚动条，溢出内容被外层
  `overflow: hidden` 裁剪且无法滚动（内容少时不暴露，内容变多才出现）。
- 正确写法：`.settings-general { height: 100%; min-height: 0; overflow-y: auto; }`，
  高度受 host 容器约束（host 有 `height: 100%`，父链 `flex: 1; min-height: 0`）。
- 参照 `.config-detail { flex: 1; min-height: 0; overflow-y: auto; }` 的滚动链模式。

## 对话区字号与内容宽度模式

- 唯一的偏好入口是 `hooks/useChatAppearance.ts`（`useSyncExternalStore` + 模块级
  listeners，对齐 `hooks/useTheme.ts`；设置面板与对话区即时同步，跨标签页经 storage 事件）：
  - 字号是**绝对值**：key `pi-chat-content-font-size`，默认 `14`，clamp `[12, 24]`
    （`clampChatContentFontSize`）。旧的相对 offset key（`pi-chat-font-offset`，
    clamp `[-4, +4]`）只作为迁移来源保留，读到时换算成绝对值。
  - 内容宽度：key `pi-chat-content-width`，默认 `820`，clamp `[820, 2000]`。
  - 损坏/缺失一律回落默认值，不对 localStorage 抛异常（读写都包 try/catch）。
- 应用链（`app/globals.css`）：`.chat-content` 把绝对字号换算成相对量
  `--chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px)`，
  各排版表面统一用 `calc(Xpx + var(--chat-font-size-offset, 0px))` 缩放：
  正文 `X=14`、表格 `X=13`、**扩展 widget 内容 `X=14`**（`.extension-widget-content`）。
  载体变量 `--chat-content-font-size` 由 `:root` 兜底 `14px`，滚动条等非对话区域不消费该 offset，
  因此天然不受影响；`ChatInput` 的 textarea 直接用 `var(--chat-content-font-size, 14px)`。
- 约束：**新增任何对话区排版表面时，字号必须写成 `calc(X + var(--chat-font-size-offset, 0px))`，
  不要写死 `rem/px`，也不要把 offset 直接套到非对话区域**（例如文件预览、设置面板）。
  历史教训：扩展 widget 曾写死 `14px`，导致字号滑块对它无效（上游 `860698a` 修的就是这处）。
- `lib/chat-font-preference.ts` 与 `--chat-font-size-base` 已不存在；不要再引用它们。
