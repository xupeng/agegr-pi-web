# 默认继承受信任扩展：只读复核

日期：2026-10-06。用户选择inherit_trusted；审查子代理session `01a11127-cc6d-7540-97bf-c431081267b5`。只读静态研究，无文件写入/网络模型请求/服务启动/实验；本文由主代理保存其结果，不代表技术门禁已实跑。

SDK相对路径均位于 `/home/xupeng/services/pi-web/dist/node_modules/@earendil-works/pi-coding-agent/`，pins 1.0.0。

## 公开工具许可 API 与搜索缺口

- sdk.d.ts:35–61仅tools?:string[]、excludeTools?:string[]、noTools，无selector/predicate接口。sdk.js:145–148与agent-session.js:1099–1100,2775–2787将tools存为持续allowedToolNames，registry refresh逐次过滤。
- 新建subagent-runtime.ts:290–300,338先枚举factory工具再传tools；rpc-manager.ts:2740,2859恢复同样传旧snapshot.tools。Sub2API search.ts:24–46,93–101在session_start注册web_search并从getAllTools判断许可。现有硬名单会挡住晚注册工具，setActiveTools无法突破。
- agent-session.js:1109–1114允许某些codemode/deferred nested执行，即仅inactive不等于撤销许可。应过滤runner可见工具Map，而非只active set。
- extensions/loader.js:231–240动态注册写入factory闭包持有的同Extension对象，再同步refresh。ask-user/extension-policy.ts:13–35复制式projection不能作为持续动态过滤方案；需保留原对象的初始扫描/后续Map.set过滤。
- resource-loader.js:417–418,695–705的sourceInfo补全晚于override。来源selectors初始过滤须等reload完成；allow/deny复用subagents selectors owner，deny在ext:*路径也要生效。当前subagent-runtime.ts:290–298无allow分支直接枚举，绕过disallowedExtensionTools，需要修正。
- agent-session.js:2830–2862负责注册激活和hidden过滤；许可projection保留exposure/defaultActive及扩展主动关闭状态，不把所有许可名强制active。

这是公开对象适配，不是SDK原生selector能力；真实SDK契约测试须覆盖动态/再次注册/reload、same object、nested旁路与激活语义，未跑前不宣称成功。

## 无安装加载的公开能力与限制

- package-manager.d.ts:42–44,85–96公开DefaultPackageManager.resolve(callback)。package-manager.js:1014–1048缺包/版本不符走callback，可skip/error避免安装。仓库builtin-extensions.ts:282–289已有先例。
- resource-loader.d.ts:75–123无manager/callback注入口；resource-loader.js:247–252自建manager，:363,492裸resolve；package-manager.js:1017–1027默认安装。noExtensions及先preflight后普通services都不能保证零安装。
- additionalExtensionPaths若package spec，会在package-manager.js:747–760无callback解析；只能使用当前授权具体文件。
- sdk.d.ts:64/sdk.js:71–80支持自带ResourceLoader；agent-session-services.d.ts:29–40不能传loader，需公开services形状的窄helper。
- SettingsManager.applyOverrides清packages不够，package-manager.js:706–707读分层getters，settings-manager.js:308–313,360–363的overrides仅影响effective投影。

现SDK方案：公共no-install预检获取enabled资源，内层DefaultResourceLoader使用无packages/resources内存settings+具体文件，防止二次发现/安装；外层保留真实settings、sourceInfo/filters/trust/reload。其SDK等价性为技术门禁。若必须升级SDK callback API则另需范围批准，当前不能做。

## Runtime、ready与快照

- subagent-runtime.ts:244,264传父runtime，services.js:72–111注册与refresh父能力；改用独立child runtime并重新解析model对象，不能沿用父model对象。
- rpc-manager.ts:2356–2359异步binding，subagent-runtime.ts:341,413随后直接prompt。须显式await ready，保证search lifecycle结束，不靠timeout。
- resourceSnapshot v1可增加独立versioned toolPolicy：新policy持久化内置许可和ext原allow/deny；tools保守兼容投影。旧v1无policy继续确切名单，不猜selectors或默认升级false。
- malformed/未知policy要拒绝，不能当缺字段。当前subagents.ts:539–568解码失败返回null，rpc-manager.ts:2717–2723,2779–2817会按普通会话加载，是必须修复的权限扩大风险。

## 默认与配置

- AgentsConfig.tsx:47–59、subagents.ts:165,179,193,321改新建/内置/缺省继承，loadSkills不变；已有明确false不变。
- subagents.ts:210–213的resourceBoolean把任意string当true；应识别none/false/all/true，规范字段优先、未知值不扩大。保留foreign whitelist原文，不宣称boolean已实现package加载白名单。
- subagents.ts:450和profile route.ts:44–55应验证PUT明确boolean，缺字段不能误保存false或覆盖用户已有false。无需新endpoint/三态UI。

## 收敛与门禁

默认继承不要求provider provenance，C只保留明确/旧noExtensions。选择策略无需再问；仍要最终实施审批。门禁：持续工具许可、无安装+metadata/trust/reload等价、独立runtime、旧快照fail-closed、ready/admission、provider-only零泄漏。失败先停下来反馈，不升级SDK或放宽权限绕过。
