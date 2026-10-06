# 正式依赖方案补充：services 的 SettingsManager 边界

> 历史技术备选，已随固定 dependency 方案撤回。最新用户决定使用原 SDK 系统发现，Web/TUI host 并立，不采用 SettingsManager facade；本文不得作为实施指令。

补充 `external-dependency-options.md` 第 5 节的实施接线细节（planning；未写产品）。

只读锚点：SDK `node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session-services.d.ts:26-36,70-77`：

- `createAgentSessionServices` 接收顶层 `settingsManager`。
- `resourceLoaderOptions` 明确 Omit 掉 `cwd | agentDir | settingsManager`，不能建议在这里直接塞第二个 settingsManager。
- services 返回的 `settingsManager` 与 resourceLoader 属于同一 services 边界。

因此最小接线是：将 packages/extensions discovery-only 投影 facade 传给 **顶层 services.settingsManager**，其余方法 bind 原 SettingsManager，model/default/auth/trust 等值保持不变。facade 并非技术上只被 resourceLoader 看见；所谓「只用于资源加载」是对它只投影资源字段的职责限制。若代码其他地方需要呈现用户原始 package settings（例如 trust 确认/配置 UI），必须读原 SettingsManager，不能把宿主隐藏 duplicate 的视图冒充用户真实配置。

若要求 resources facade 与 services.settingsManager 完全分离，则需显式组合自建 DefaultResourceLoader 的 services 或切换到允许自带 resourceLoader 的 SDK 创建路径；这比顶层窄投影更大，本轮不优先。此限制不构成需要外部仓库修改/发布的阻塞。

本补充仅 read + 新建 research 文件；无安装/探针/进程/真实配置修改。apply_patch 在本子代理工具和 shell 均不可用，使用新文件 write。
