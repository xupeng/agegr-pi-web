# AskUser 代码来源与 fork / 上游归属（2026-10-06）

## 结论

Web 内建 AskUser 在运行时是本仓库自包含的实现，不 import 当前外部 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`。但两者不是无关的独立设计：外部扩展是从本仓库 portable core 抽出后新增 TUI adapter 的同源实现。方向是 Web → portable → 外部扩展，而不是 Web 内建工具依赖外部扩展。

## 当前 import 链

- `lib/rpc-manager.ts:36,2717` 导入并注入 `createAskUserExtension`。
- `lib/ask-user/extension.ts:4,28-34` 导入本仓库 `./tool` 并直接注入 live wrapper 的 openAsk。
- `lib/ask-user/tool.ts:9-14` 再导出 `./portable/tool`；schema、execute 与 Web 的 model-only 均在本仓库源码里。
- 产品 `package.json` 无外部 `pi-ask-user` 依赖，也无导入其本机目录。用户 packages 安装是另一条 SDK discovery 链，不是这条 Web 内建工具的 dependency。
- 外部 `README.md:6-7` 明示核心抽自 Pi Web 的 `lib/ask-user/portable/`；`README.md:225-235` 将 Web 消费外部源的 wiring 仍记为 future change；`LICENSE:5-7` 保留 copied-from-Pi-Web 的说明。

## Git 历史

1. `64bb544d39c4856034871dbf512afdf2ac99d5f3`，2026-08-29，作者 xupeng，`feat: 支持 ask_user 向用户提问（异步卡片 + follow-up 唤醒）`。
   该提交首次加入 Web 的 extension/tool/store/card、RPC/SSE/submit-cancel、设置开关。提交说明是参照另一个 pi-web fork 的异步 AskUser 设计移植；这不意味着本仓库上游 agegr/pi-web 已有此功能。
2. `aadfb6f938e7a2aeb82937fbc722db55045e8665`，2026-09-25，作者 xupeng，`feat(ask-user): add portable local extension and host bridge`。
   在本仓库抽出 `lib/ask-user/portable/`，Web 的 tool/types 改为本地再导出，Web adapter 仍 direct open。
3. 外部独立仓库 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`（remote origin 为 xupeng/pi-ask-user），初始提交 `8e0db3f5abdda558a85a02103bd4b55e75301f84`，2026-10-06，作者 xupeng，`feat: add portable ask_user tool with native TUI support`。
   核心与 Web 同源，增加 terminal host、branch state、form 和 TUI probes；不是自动改造 Web 内建路径。

## 与上游的界线

上游 remote 在本机名为 `for-sync`，指向 agegr/pi-web；不是名为 upstream。已同步上游 ref `for-sync/main` 为 `6fcd7d4`（2026-10-03，Release v0.10.0）。

- `git branch -a --contains 64bb544` 仅列本地 personal 与 fork feature branch，不列 main/for-sync/main。
- 对 `64bb544`、`aadfb6f` 执行 `git merge-base --is-ancestor <commit> for-sync/main` 均退出 1。
- `git ls-tree -r --name-only for-sync/main -- lib/ask-user components/AskUserAppHost.tsx components/AskUserCard.tsx app/api/settings/ask-user` 无文件。
- `git grep -n -i -e ask_user -e ask-user for-sync/main -- app components lib` 无匹配。

因此可确认这套功能是 fork 的 personal 开发线引入，不是已同步上游原有功能。本轮未 fetch 上游最新 HEAD，不能把此证据扩张为“2026-10-06 在线上游最新提交也没有”。

## 对规划的影响

当前是两份同源、各自注册的 core，尚未通过依赖或单一代码源保持同步。外部更新不会更新 Web 内建实现，却会通过用户 SDK package discovery 抢占同名工具。前轮“外部 owner + Web host 投影”仍是待批准提案，不是当前已存在的共享依赖关系。

本轮只读核查与任务研究记录；没有 task start、产品代码变更、部署或服务重启。
