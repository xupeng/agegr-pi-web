# 执行顺序

## 前置（硬闸门）

- A、B 已合并；`lib/ask-user/portable/view-controller.test.mjs` 与 `lib/ask-user/portable/react/AskUserView.test.mjs` 全绿。
- 不删除任何文件之前，必须先完成步骤 1–2。

## 步骤

1. **改渲染**：`components/AskUserAppHost.tsx` 瘦身为适配器（取文案、映射 CSS 变量、转发命令三件事）。删掉投影 fetch、iframe、握手、消息校验、字体投递、`failed` 状态与三态标记。保留 props 契约、挂载位置与 `key={pendingAsk.askId}` 所依赖的挂载语义。

2. **本地跑通全流程**：`npm run dev`（先 `lsof -nP -iTCP:30141 -sTCP:LISTEN` 复用已有进程，不要起第二个 dev server）。按父 `implement.md` 步骤 3 的手工清单逐项核对，包含跨设备轮询与切会话重水合。**这一步不过就不许进入步骤 3。**

3. **改测试**：`components/AskUserAppHost.test.mjs` 逐条判定 —— 保留仍有意义的断言（回调只转发当前 `askId`、失败不清空新 ask、props 渲染），把 Apps 协议断言替换为共享组件断言，新增 `data-ask-user-view="shared"` 断言。不要整文件重写。

4. **删文件**：按 design 的删除清单逐项 `git rm`。每删一项就地搜索引用（含测试文件与 `lib/ask-user/index.ts` 的再导出面），避免留下死 import。同步删除 `next.config.ts` 的 externals 与 `lib/next-config.test.mjs` 的相关断言。

5. **依赖清理**：`npm uninstall @modelcontextprotocol/client @modelcontextprotocol/core @modelcontextprotocol/server @modelcontextprotocol/ext-apps zod`。`zod` 是「只被一个文件使用」的依赖，移除后必须由步骤 4 的引用搜索兜底；lockfile 必须与 `package.json` 一致。

6. **i18n 清理**：删三语 `chat.askUserAppFailed*` 四键，核对三份消息表键集合相等。不要顺手动 `chat.askUserOther`（PR #9 之前就无调用方的既存孤儿键，与本任务无关）。

7. **spec 与 ADR**：按 design 的「spec 与 ADR」执行，回滚四份 spec 的 PR #9 条目时逐条对照 `git show 9c2cd86 -- <file>`。

8. **最终核对**：残留搜索、lockfile、三条标准命令，外加手工全流程**再跑一遍**（这次是在删除之后、依赖清理之后）。

## 验证命令

```bash
node_modules/.bin/tsc --noEmit
npm run lint
XDG_STATE_HOME= npm test
grep -rn "@modelcontextprotocol\|srcdoc\|ASK_USER_VIEW_SCRIPT_HASH\|theme-tokens\|view-fonts\|view-font-manifest\|ask-view" \
  --include=*.ts --include=*.tsx --include=*.mjs \
  app components lib hooks next.config.ts proxy.ts
```

残留搜索应无输出（`package-lock.json` 中的 `@modelcontextprotocol` 传递依赖条目如仍被其他包依赖，需在此处说明而非忽略）。

## 风险与回滚

- 回滚 = revert 本任务提交（git 保留全部被删实现），但渲染路径会回到 iframe，需要重跑其验证。
- 顺序风险最高的是「先删后切」：步骤 1–2 是防它的唯一手段。
- 不要把 A、B 的归档与日志攒到本分支 —— 它们各自随自己的 PR 合并（见根 `AGENTS.md`）。本分支只归档 C 与父任务。
