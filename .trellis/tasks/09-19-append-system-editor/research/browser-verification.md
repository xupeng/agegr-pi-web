# 浏览器验证（2026-09-27）

**这是真实浏览器运行**（Playwright + 已安装的 Chromium headless shell），不是数据链路脚本：
断言依赖点击、真实 `fetch` 往返、磁盘字节与视口布局。数据链路侧的证据（用 pi 自己的
`DefaultResourceLoader` 证明「写进去的文件就是 pi 会加载的追加提示」）在
`lib/append-system.test.mjs` 里，属另一类证据，已在 `verification-baseline.md` 的单测计数中体现。

## 怎么跑的

- 临时 worktree `/home/xupeng/dev/personal/forked/.pi-append-verify`（detached on `bc36f7b`）
  里起 `next dev -H 127.0.0.1 -p <空闲端口>`；`node_modules` 用 `cp -al` 硬链接复制。
  本 checkout 有活跃 dev server（8505）持有 `.next/dev/lock`，因此**不能**在原地再起一个。
- `PI_CODING_AGENT_DIR` 指向 `mktemp -d` 出来的临时 agent 目录：用户真实的
  `~/.pi/agent/APPEND_SYSTEM.md` 只被**读取**一次作为初始内容（322B），全程不被写入。
  脚本跑完后 `ls -l` 复核：仍是 322B / 2026-08-07。
- 夹具：`<agentDir>/APPEND_SYSTEM.md`（真实内容的副本）、`<agentDir>/project/.pi/APPEND_SYSTEM.md`
  （项目级覆盖，制造 R4 两态）、一条 `<agentDir>/sessions/verify/…_verify-append-session.jsonl`
  会话，其 `cwd` 指向那个项目，用于让设置面板拿到 `cwd`。
- 跑完删除 worktree 与临时目录（`git worktree prune` 后只剩主仓）。

## 结果：33/33

桌面 1280×1000：

| # | 断言 | 实测 |
|---|---|---|
| 1 | 编辑器逐字节加载全局文件 | 与种子内容全等 |
| 2 | 头部显示的是服务端给的路径 | `/tmp/pi-web-append-verify-*/APPEND_SYSTEM.md` |
| 3 | 字节计数按 UTF-8 计 | `322 / 65536 bytes` |
| 4–6 | 三条生效范围文案逐条渲染 | 「普通会话生效」「Chat only 不生效」「内建子代理不生效」各 1 处 |
| 7 | 重载提示渲染 | 1 处 |
| 8 | 项目级覆盖块出现 | 存在 |
| 9 | 未受信时点名项目文件 | `…/project/.pi/APPEND_SYSTEM.md` |
| 10 | 未受信时说明 pi 仍读全局 | 「not trusted, so pi still reads the global file」 |
| 11 | 未受信时不加 `is-active` | class 无 `is-active` |
| 12 | 24000 个汉字（=72000 字节）触发超限提示 | 提示出现 |
| 13 | 超限时保存禁用 | `disabled` |
| 14 | 被拒绝的草稿不落盘 | 磁盘内容仍等于种子 |
| 15 | 保存逐字节写入 | 磁盘内容全等（含中文与末尾换行） |
| 16 | 写入权限 0600 | `600` |
| 17 | 保存后草稿转为干净 | 「放弃修改」按钮消失 |
| 18 | 计数器跟随已保存内容 | 与新内容字节数一致 |
| 19 | `POST /api/project-trust` 接受夹具项目 | 200 |
| 20 | 受信后文案改为「覆盖全局」 | 「overrides this global file」 |
| 21 | 受信后加 `is-active` | 有 |
| 22 | 重载后仍显示已保存内容 | 全等 |
| 23 | 无页面异常 | 无 |

移动端 390×844（同一已打开的对话框缩窄到移动断点）：

| # | 断言 | 实测 |
|---|---|---|
| 24 | 移动端 section 选择器可见 | `display: block` 生效 |
| 25 | 桌面 tab 列表隐藏 | 隐藏 |
| 26 | 通过选择器切到该 section 后编辑器加载 | 内容与已保存内容全等 |
| 27 | 窄视口下三条范围文案仍在 | 第 3 条 1 处 |
| 28 | 设置面板为全屏 | `{x:0,y:0,width:390,height:844}` |
| 29 | 该 section 无横向溢出 | `scrollWidth 390 == clientWidth 390` |
| 30 | 页面本身不横向滚动 | `documentElement.scrollWidth 390 <= innerWidth 390` |
| 31 | 编辑区纵向可滚动 | `overflow-y:auto`，`scrollHeight 898 > clientHeight 742` |
| 32 | 保存按钮仍可达 | 可见可点 |
| 33 | 无页面异常 | 无 |

## 过程中的一次自纠（留档）

第一次跑是 22/23：断言 1 失败，其余全过。原因**不是**应用缺陷，而是脚本抢跑 ——
`loading` 期间 textarea 是 `disabled` 的，脚本在 GET 返回前就读了 `inputValue()`，
而紧随其后的字节计数（322）已经正确，说明数据本身没问题。中途我曾怀疑是文件的 CRLF 被
`<textarea>` 归一化，用字节检查排除了该假设（真实文件是纯 LF、无 BOM、322 字节）。
改法是等待「编辑器脱离 disabled」这一语义信号，而不是等待元素出现。

## 未覆盖 / 诚实的边界

- **移动端入口本身没走**：390px 下侧栏是 off-canvas，脚本没有去点它的开关；移动端断言是在
  已经打开的对话框上缩窄视口取得的。因此「手机上如何点进设置」不在本次证据范围内，
  被证明的是「该 section 在 ≤640px 的媒体查询下布局正确」。
- **没有跑仓库的 e2e 套件**（原因见 `verification-baseline.md`）：即该 section 没有被纳入
  `e2e/run.mjs` 的常驻回归。若后续要常驻化，建议直接在 `e2e/` 下新写一个独立模块。
- **没有真模型调用**：「保存 → 新建会话生效」这一条不是靠让模型复述提示来验证的，而是用
  pi 自己的 `DefaultResourceLoader` 断言 loader 读到的就是保存的内容（数据链路证据），
  外加浏览器侧证明文件字节与权限正确。
- **未验证非法 UTF-8 字节**：端点写入源是 JSON 字符串，正常路径不产生非法 UTF-8；
  `readFileSync(..., "utf8")` 对非法字节会用替换字符，设计未要求处理任意二进制。
