# 对话列横向对齐验证

- 复现前：Chromium 1280px E2E 长会话中，滚动槽位 10px，消息边界 `337..1157`，输入框 `342..1162`；断言失败。独立布局探针在 700px 宽下观察到右边界相差 10px。
- 修复后第一次 E2E：1280px 长/短 `337..1157`，800px 窄桌面 `276..738`，390px 移动长会话 `16..364`，消息与输入框同界。后续已有移动历史分页节点保留断言偶发失败；第二次 E2E 在 ask_user 等待弹窗时超时。后来 8505 进程持有 `.next/dev/lock`，不能在同一 checkout 重跑自启服务的全套 E2E。新增的状态转换/触屏 E2E 断言尚未在全套中跑到。
- 对现有 8505 服务的真实 Chromium 只读检查：桌面 1280px、800px 和移动 390px 长/短会话均对齐且无文档水平溢出。390px 短会话高度 844px 到 300px 时从不可滚动变为可滚动；普通指针槽位 10px、触屏仿真槽位 6px，切换前后消息和输入框的边界保持一致。长会话滚动到底部也不改变横向边界。
- 复核脚本最终版本：1280px 长/短 `337..1157`，800px 长/短 `276..738`；390px 普通指针 `16..364`，390px 触屏 `16..368`。四种视口/指针组合中的滚动到底部、短对话从不可滚动变为可滚动均保持完全相同的横坐标。`e2e/run.mjs` 已加入这些状态转换与真实内容展开前后的断言，后者在完整套件中仍未跑到。
- `node_modules/.bin/tsc --noEmit` 通过；`npm run lint` 0 issue；`git diff --check` 通过。`npm test` 1720 项中 1718 通过、2 项与本次布局无关的环境失败：全局 SDK 解析返回 `ERR_PACKAGE_PATH_NOT_EXPORTED` 而非测试预期的 `MODULE_NOT_FOUND`；本机 `XDG_STATE_HOME` 覆盖了技能锁路径测试预期。
- 相关组件单测 `node --test components/ChatWindow*.test.mjs components/ChatInput*.test.mjs components/ChatMinimap.test.mjs` 68/68 通过；两个 E2E 脚本 `node --check` 通过。
- 未执行 `next build`；未停止或重启其他会话启动的 8505 服务。
