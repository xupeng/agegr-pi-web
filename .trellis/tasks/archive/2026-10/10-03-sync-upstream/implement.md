# 实施与验收计划

## 开始前

- [x] 用户在最终规划摘要之后明确批准实施，再执行 task.py start。
- [x] 核实当前 personal 仍为 BASE，TARGET 不变；若远端继续推进，仍使用已批准固定 SHA，不静默扩大范围。
- [x] 检查工作树、现有服务和用户资产；任务产物外不得混入其他会话未提交文件。
- [x] 按 .trellis/spec/guides/upstream-sync.md 和 frontend 相关契约加载实施上下文。

## 实施顺序

1. 独立磁盘工作树测 personal@BASE 基线：`npm ci --include=dev`，隔离 HOME 与 PI_CODING_AGENT_DIR，记录 tsc/lint/tests 退出码、lint 覆盖数量和依赖版本。
2. 从 BASE 建立 `merge/upstream-20261003` 工作树，非快进合并固定 TARGET，逐块处理预演的 14 个冲突。
3. 保留 fork 元数据，更新四个主 SDK pins、portable peers/发现断言，正确合成并验证 npm lock。
4. 逐项核实 design.md 兼容性边界，重点复核自动合并 rpc-manager/builtin-extensions/AppShell/工具选择/Trellis owners。
5. 在锁文件一致的候选依赖树验证；发现的兼容性问题在任务边界内修复并补回归，范围显著变化先报告用户。
6. 独立检查合并后的语义和测试证据；按指定路径暂存，确认提交方案后形成本地合并/修复提交。最终任务产物、归档与会话日志保留在任务分支，绝不先合入 personal 再补归档。

## 验证

- 必须：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`，记录各自真实退出码并与实测基线对照。
- SDK/ask：portable discovery、真实 SDK codemode/ask_user integration、自测/内部模块身份；直接 ask terminate 与 script model-only 拒绝。
- 生命周期：prompt disposition、preflight reject、MCP prepare Stop、slash 分流、host closing/dispose、工具 configured/pin/reload/navigation。
- fork：Trellis tool-end structured final、SSE replay、watchdog raw 事件、APPEND_SYSTEM 与 Chat-only/子代理资源边界、成功产物授权、运行中 fork。
- 新能力：上游 MCP config/import/secrets/test/sign-in/trust/settings 测试，本地 fixtures，不连接真实用户 MCP。
- 浏览器：独立数据和已核实 Chromium，覆盖 Settings › MCP、工具菜单、ask_user、minimap 与移动布局；与单元/数据链证据分开报告。不可用时说明环境阻塞及未覆盖项，不擅自破坏当前 dev lock。
- 收尾：TARGET 为结果 HEAD 的祖先、无冲突标记、无误删 fork 文件、包/锁/用户资产保持预期；在 research/verification.md 记录最终 H、计数、残余风险。

## 非目标

不发布、不更新 changelog、不升级 Trellis、不运行开发 checkout 的 next build、不自动 push/开 PR/合并 PR。
