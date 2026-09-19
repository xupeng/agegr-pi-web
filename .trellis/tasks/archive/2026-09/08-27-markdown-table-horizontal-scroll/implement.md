# 实施计划

1. 在 `app/globals.css` 中调整 Markdown 表格宽度规则：表格使用内容驱动宽度且至少铺满容器，各列按内容自适应，并仅为长内容设置合理的最大宽度。
2. 保留 `.markdown-table-wrap` 作为唯一横向滚动边界，并补充适合触摸/嵌套滚动的行为配置。
3. 在 `components/MarkdownBody.test.mjs` 中增加 Markdown 表格渲染用例，锁定滚动容器和表格的 DOM 结构。
4. 运行 Markdown 组件测试、完整测试、lint 和 TypeScript 类型检查；必要时在桌面和手机视口验证实际滚动效果。
