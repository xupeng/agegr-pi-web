# 平板/对话列锚定 UX 修正（2026-10-06 用户批准）

只为通知面板的桌面定位补一次小范围 UX 修正，不改通知状态、网络、ack、导航、SDK、
pending 投影、聊天排版或 `10-06-subagent-model-selection`。

## 行为差

- 现状：`.notification-center` 桌面为 `position: fixed; inset: auto 12px auto auto;
  width: min(460px, calc(100vw - 24px))`，固定贴视口右缘。约 667 CSS px（iPad 竖屏）
  且左栏展开、右文件面板关闭时，真实对话列宽约 410px，面板右缘与视口重合、左缘越出
  对话列；收起左栏后面板位置完全不变。
- 目标：水平居中于**真实对话列**（左栏与右文件面板之间），宽度 ≤ 对话列宽 − 2×12px
  且 ≤ 460px；顶部保持工具栏下方；侧栏展开/收起/拖宽、右面板变化、旋转/窗口 resize
  实时跟随；≤640px 仍为全屏面板。

## 真实 owner

- 坐标 owner：`components/AppShell.tsx` 中工具栏下的对话内容列 DOM
  （"Center: chat" 内的 `<div style={{ flex: 1, overflow: "hidden", position: "relative" }}>`）。
  测量只用该元素 ref 的 `getBoundingClientRect()`；不读 localStorage 侧栏宽度猜坐标、
  不全局 `querySelector`、不新增 context 或第二套测量层。
- 盒模型 owner：`components/NotificationCenter.tsx` 导出的纯函数
  `computeNotificationCenterBox(anchor, viewport, fallbackTop)`；观察与状态在该组件内
  `useLayoutEffect`。
- 样式 owner：`app/globals.css` 的 `.notification-center`（CSS 变量 + 视口居中兜底）
  与 `@media (max-width: 640px)`。

## 必要文件

- `components/AppShell.tsx`：新增 `notificationAnchorRef` 挂到对话内容列，并向
  `NotificationCenter` 传 `anchorRef`。不重排布局树。
- `components/NotificationCenter.tsx`：纯盒计算 + `ResizeObserver`/`resize` 受控观察 +
  CSS 变量输出；`showModal`、顶层互斥、导航退休语义不变。
- `app/globals.css`：桌面由 `--notification-center-{top,left,width}` 定位，未测量时
  视口居中；移动端媒体查询补 `transform: none !important`，避免全屏时被居中位移。
- `components/NotificationCenter.test.mjs`：纯函数矩阵 + 源码/CSS 契约断言。

## 不做

- 不改通知状态/网络/ack/import/导航/SDK pins、pending 投影、原聊天排版与字号 offset。
- 不改 `10-06-subagent-model-selection`；不提交/推送/归档。
- 不做服务端验收；浏览器只证明前端布局（独立 Chromium context，`/api/**` stub）。
- 不引入 visualViewport 缩放补偿（移动端全屏、桌面无软键盘），不改既有 `topPanelPos`
  对其它顶栏面板的职责。

## 限制

- 只验证前端矩形/居中误差/工具栏下方/窄屏全屏，不代表真实 iPad 硬件旋转或 iOS safe-area。
- `ResizeObserver` 只在尺寸变化时触发；`window resize` 监听覆盖位置-only 变化
  （工具栏高度、安全区）。

## 验证结果（2026-10-06）

- 纯函数/组件测试：`node --experimental-strip-types --test components/NotificationCenter.test.mjs`
  → 7/7 pass。矩阵 667/800/1024/1280 断言居中误差 ≤2px、宽度 ≤460 且 ≤ 列宽−24、
  左右各 ≥12px、不越视口；无锚点回退视口居中，列塌缩到 150px 时宽度夹到 280px 仍可见；
  源码/CSS 契约（真实 ref 测量、ResizeObserver + resize、cleanup 成对、移动端 transform 重置）。
- 相关既有回归：`NotificationCenter`、`AppShell.notifications`、`AppShell.notification-order`、
  `AppShell.mobile-toolbar`、`AppShell.workspace-memory`、`useNotifications` 共 39/39 pass。
- `tsc --noEmit --incremental false` 与针对改动文件的 `eslint` 均 0 错误。
- 浏览器（独立 Chromium persistent context，所有 `/api/**` 由只读 fixture 兜底，无 POST/ack/agent）：
  `E2E_LAYOUT_BASE_URL=http://192.168.11.233:8505 node e2e/notification-center-layout.mjs`
  → status pass，报告 `validation-logs/layout-2026-10-06T13-28-04-810Z/report.json`。
  667px 关键值：列 `[260,667] w=407`，弹窗 `[272,655] w=383 top=36`（左右各 12px、中心误差 0、
  工具栏下方）；侧栏收起后列 `[0,667]` 弹窗随之重居中；390px 全屏且 close 44×44。
- **陈旧 dev CSS 限制**：Turbopack 首次未感知 `app/globals.css` 的 apply_patch 替换，
  8505 一度继续服务旧 chunk（`inset:auto 12px...`）；补一次真实内容写入后已重编译，
  现服务的 chunk 含 `--notification-center-left/width`。若复跑前页面仍为旧规则，需先确认
  `.next/dev/static/chunks/_1pj7b4_._.css` 含新变量，再采信浏览器结果。
- 641–959px 右文件面板是覆盖层而非分栏（其 backdrop 同时遮住铃铛），实测列宽不变；
  仅 ≥960px 的分栏会收窄对话列，脚本分别断言。
- 未覆盖：真实 iOS safe-area/硬件旋转、服务端/API 验收、通知状态/ack/导航/SDK 行为。

## 独立 check 复核与修正（2026-10-06 13:35–13:43 UTC）

检查代理 `01a1116a-5e60-7540-97bf-c44a5eb273a7`，只修本轮布局与安全验证脚本。
**本节取代上节“150px 列夹到 280px”的验收结论**；那是错误的测试预期，不是被批准的
UX 下限。上节与旧 browser report 保留为历史证据，不将旧绿测试当作窄列合同通过。

### 发现与修正

- **P2 合同违反，已修**：`Math.max(min280, columnAvailableWidth)` 会让正宽窄列越界，违反
  PRD R1/AC14 的 `width ≤ columnWidth − 24`。移除 280 floor；有效可见列先取其 padded
  bounds 与 viewport padded bounds 的交集，再限制 460cap；正宽列不使用 viewport fallback。
  unavailable/zero-width/完全离屏 anchor 才 fallback。部分离屏列仍受列与 viewport 双重约束。
  无法容纳 24px padding 的纯 helper 输入返回零宽、原点留在可见列内，不悄悄扩大 UX。
  150px 测试现在断言 `[212,338] width=126`、两侧各 12px，而非只检查“280 可见”。
  同一测试补 244/320px、部分离屏与极窄输入；矩阵原对齐断言未放松。
- **P2 验证安全缺口，已修**：旧 fixture 未知非 GET 返回 200 `{}`，且未 block ServiceWorker。
  现在所有 `/api/**` 经 context.route 兜底，任何非 GET 均 403，persistent context 设置
  `serviceWorkers: "block"`；131 个 API 请求全部本地 fulfill，非 GET 为 **0**。
  不点击事项、批量查看/刷新，不触发 agent/new、命令、MCP、ack/import 到 live。
- **最小 CSS 修正**：header title `min-width:0; overflow-wrap:anywhere`，action buttons
  `min-width:0; max-width:100%; overflow-wrap:anywhere`，hint 可折行；44×44 close 不缩小。
  不改字体、其它聊天排版、主题或 pending/导航状态。
- **P3 harness 稳定性，已修**：SSR 可见 bell 不代表 hydration 完成。首次复跑 800px
  首击无 dialog，失败截图显示完整页面而非产品异常；改为等待 fixture count publication
  与 settled paint 再真实 click，无重试吞失败。profile 的旧 Unix socket 长度断言错误地
  限制 PI_TASK_TMPDIR；实际 socket 在独立短 browserTmp，移除错误 guard，profile/results
  仍留 PI_TASK_TMPDIR。browserTmp 新建 0700、finally 只删本 run 精确目录。
- **保留合同**：AppShell 真实 anchorRef 接线已正确，本 check 未再修改 AppShell；observer
  disconnect / window resize remove 成对、SSR/render 不访问 window；native showModal/
  close、Escape capture、焦点返回、导航退休与移动端 transform 重置保持不变。
- **规划遗留交给主代理**：`design.md §8` 的旧 `clamp(... min280 ...)` 公式仍是被本轮
  明确否决的细节；PRD/本次用户合同优先。本 check 只补实施清单与本证据，未扩大授权
  编辑设计、总 spec、`verification.md`、`task.json`。主代理应同步删除设计中的旧 floor。

### 真实可达性：没有用假几何宣称复现

通过真实 resize handle 的 pointer drag、真实左右面板按钮和 Playwright viewport resize：

| 场景 | 真实 column | dialog | 结果 |
| --- | --- | --- | --- |
| 667px，默认左栏展开，两条 ask fixture | `[260,667] w407` | `[272,655] w383 top36` | 两侧12px、中心差0 |
| 1280px，左栏拖到480，右栏真实展开并拖到300 | `[480,980] w500` | `[500,960] w460` | 两面板同时开，中心差0 |
| 上述 dialog open 中降到1024 / 960 | `w420` | `w396` | 两面板同时开，严格列内 |
| 再降到641（右栏变原有 overlay） | `[240,641] w401` | `[252,629] w377` | open、中心差0 |
| 独立641px，左栏真实拖到最大321 | `[321,641] w320` | `[333,629] w296` | 最窄 compact 稳态、两侧12px |
| open 中641→640→390→641→1024 | ≤640 全屏；回桌面重新锚定 | 390×900 / 640×900 fullscreen | 原 mobile 逻辑会收左栏，未伪造其保持展开 |
| 独立 touch/mobile390×780 | `[0,390]` | `[0,390]×[0,780]` | close44×44、真实 hit-test |

现有 `lib/panel-layout.ts` compact chat min320 / desktop min420 与 resizer resize reclamp
在上述操作中生效，**未在真实稳态布局中复现 <304px column**。因此“150px 真实浏览器
已复现”不成立：150px 是纯 helper 合同反例，browser 最小稳态列320px、面板296px。
仍必须移除未经批准 floor，不能以当前 resizer 保护替代纯几何合同。小于24px列无法同时
满足两侧12px，属于不可达且未扩设计的边界；不宣称零宽时控件可用。

### 正式 browser 证据与 CSS 身份

- 最终 `validation-logs/layout-2026-10-06T13-41-40-298Z/report.json`：**pass，10 场景、
  39 measurements、15 screenshots**。原 667/800/1024/1280、侧栏开关/拖宽、右栏分栏/
  compact overlay、open resize 对齐断言全部保留；新增双栏、641极限与断点往返。
- 默认 snapshot 两条跨项目 ask（只假摘要数据，不提交），另60项验证受约束滚动链。
  compact641 list `clientHeight=658 / scrollHeight=7938`，真实 scrollTop 增长；关闭按钮
  hit-test 始终命中且44×44，批量/刷新矩形在 dialog 内；实际点击 close，焦点回 bell。
  所有已打开桌面样本最大中心误差 **0px**，宽度≤460且≤column−24，栏内 gap≥12。
- 窄列与移动截图分别 `compact-641-max-sidebar.png`、`both-panels-1280.png`、
  `roundtrip-*.png`、`mobile-390.png`；两条摘要截图 `baseline-667.png` 等。
- 浏览器真实 HTTP 返回 CSS `_1pj7b4_._.css` SHA256
  `edb06d75e75aa7cc6998820ad01b72b61cbe9f18479ef98e921adc6647e7047d`；report 保存 header/
  actions 的实际规则，computed-style 也断言 header minWidth0 / overflowWrap anywhere。
  cache-busting URL + explicit reload 后加载正确新 CSS；**未覆盖源码强制刷新、未写 .next、
  未重启用户 Next**。不以读取磁盘 chunk 代替 HTTP 证据。
- 无 trace/录像采集，失败只留 screenshot/report。先前失败 run
  `layout-2026-10-06T13-35-59-495Z`（错误 profile guard）和
  `layout-2026-10-06T13-36-15-750Z`（hydration 首击）完整保留，后续
  `layout-2026-10-06T13-38-14-580Z` 为扩641极限之前的通过轮；未抹掉失败。

### 最终门禁、基线与源码身份

同主仓既有干净 `npm ci --include=dev` 锁一致树，未重装依赖、未复制源码/依赖/worktree。
门禁完整输出在 `validation-logs/tablet-check-01a1116a-final/`：

| 门禁 | 最终结果 | 固定 e0ad630 baseline |
| --- | --- | --- |
| `tsc --noEmit --incremental false` | exit0 | exit0 |
| 完整 `npm run lint` + ESLint JSON | exit0；733 files，0 error/warning/fatal | 698 files，0诊断 |
| 完整 `npm test`（含原 runtime/真SDK测试） | exit0；3005 tests / 13 suites，3005 pass | 2853 tests / 13 suites，全pass |
| 六文件定向测试 | exit0；39/39 pass | 本轮针对候选回归 |

对 baseline 的 +35 lint targets / +152 tests 来自整个未提交 notification-center candidate
新增的前端/API/通知状态与SDK回归文件，不是本 check 删测试/降规则；本 check 扩同一7个
NotificationCenter tests 的输入断言，没有减少用例。Node24.21.0/npm11.19.0、TS5.9.3/
ESLint9.39.4/Next与config16.3.6/hooks插件7.0.1，四个Pi pins实装仍1.0.0；混装标记均不存在。
版本、计数与 cleanup 详情在 `metadata.json`。

命令在 pi-tmp-run 内，runtime 子进程用 baseline 等价 `env -i` allowlist（PATH/LANG、
隔离HOME/PI_CODING_AGENT_DIR/TMPDIR/XDG、PI_TASK_TMPDIR），不继承真实认证/agent路径，
不设全局PI_OFFLINE或PI_WEB_DISABLE_MCP。为避开 `/home/xupeng/.agents/skills` 祖先污染，
runtime fixture用 `/var/tmp/notification-tablet-check.rlTfmFUS`（btrfs主磁盘、唯一0700根），
已核查 `/var/.agents/skills` 与 `/.agents/skills` 不存在，trap精确清理；小检查日志/profile/
results用 PI_TASK_TMPDIR，退出前正式迁出证据。

`source-before.log` 与 `source-after.log` 完全相同，并与 browser 的 pre/post SHA256 对应：
AppShell / NotificationCenter / tests / globals.css / layout harness / package.json / lock 共7项。
`tablet-layout-source-manifest.json` 指向最终 browser report；未动历史冻结
`source-manifest.json` 与12:44真实SDK browser证据。本轮两次完整门禁日志均保留，先轮见
`validation-logs/tablet-check-01a1116a/`，最终轮以 `-final/` 为准。

### 收尾与明确未覆盖

- 所有本 check 自有 context/browser 已 close；短 browserTmp精确删、PI_TASK_TMPDIR及
  /var/tmp fixture均确认不存在。唯一正式证据在任务research，不依赖自动清理缓存。
- 用户8505 CLI1118376 / Next1118396仍在，root HTTP200；正式Next1005816仍在，未触碰。
  未restart、未second Next、未build、未改.next、未commit/push/PR/archive。
- 未覆盖：真实iOS/Safari/Windows、safe-area非零/软件键盘/硬件旋转，<304px或<24px真实
  对话列可用性，模态打开时用户不可达的侧栏拖拽。布局browser全stub，不证明服务端/API/
  notification ack/导航/同步/SDK行为；完整隔离npm suite单独提供回归证据，不冒充这些
  未执行的browser功能矩阵。其它主仓改动及subagent-model-selection未被本 check修改。
