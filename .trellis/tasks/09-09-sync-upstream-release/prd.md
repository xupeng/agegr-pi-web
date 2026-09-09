# 同步上游并发布新版本

## 目标
将 upstream/main 更新合入 personal，处理兼容性与冲突，并发布可安装的 @xup3ng/pi-web 新版本。

## 已确认事实
- 起点 personal 8040f64，初始工作区干净，跟踪 origin/personal。
- upstream/main 已抓取至 a26cc68，共 57 个尚未合入的提交，涉及 146 个文件。
- 本地及 npm 最新版本均为 0.9.1；现有 release 脚本采用 patch 递增。
- 上游引入终端及 node-pty、浏览器密码登录、主题、聊天外观、会话扫描改动，Pi SDK 升至 0.85.1。

## 要求
1. 合并 upstream/main 至 personal，保留 fork 包名、发布配置与仍适用的个人改动；重叠实现避免机械叠加。
2. 按现有 patch 发布约定发布 0.9.2；若执行前版本已占用则暂停重新确认。
3. 完成测试、lint、类型检查与隔离发布构建、包内容检查、安装启动验证。
4. 提交并推送 origin/personal，发布 npm public latest，核验远程版本。

## 验收标准
- 上游目标提交成为 personal 的祖先；无未解决冲突。
- fork 身份保持 @xup3ng/pi-web，关键个人功能无已知回归。
- 验证通过后才发布；阻塞失败必须记录并先处理。
- npm latest 为 0.9.2，实际发布包可安装启动；报告 Git 提交及验证结果。

## 范围外
不向 upstream 推送，不重写历史，不新增无关功能，不升级 Trellis，不默认创建 GitHub Release。

## 风险
原生终端依赖、SDK 升级与个人 UI/会话缓存逻辑有兼容风险；npm 认证可能需用户交互。发布不可覆盖，失败后不盲目重发。规划待用户最终批准。
