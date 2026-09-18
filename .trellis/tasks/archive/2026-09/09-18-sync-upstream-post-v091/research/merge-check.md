# 独立合并检查（Trellis Phase 2.2）

检查日期：2026-09-18。检查对象：主 checkout 当前工作树及 index；HEAD 仍为 `391c141`，merge 尚未提交。

已读取 check.jsonl 全部条目、prd/design/implement、merge-execution，以及 settings-dialog-mobile spec。本检查未派生子代理，未修改源码/测试，未 add/commit/push/tag/reset/continue，未 build。唯一新增仓库文件为本报告。

本次复跑原始日志：`/tmp/pi-merge-check-ClPTpa/`（tsc.log、lint.log、eslint.json、test.log、focused.log、layout.log、markers.log；主要命令退出码另存 *.exit）。这是本次实际执行结果，不是复制前次验证结论。

## 1. 合并拓扑与冲突清理 — PASS（源码；原始 grep 的零输出预期不成立）

实际执行：

```sh
git rev-parse MERGE_HEAD
git log --oneline -1 MERGE_HEAD
git ls-files -u
git diff --check
git diff --cached --check
```

输出：

```text
860698a6573e63a2432157676a5ac9bc9ce54044
860698a feat: add extension widget font size setting (#733)
# ls-files -u 无输出
# 两条 diff --check 均无输出，exit 0
```

按委派要求原样执行：

```sh
grep -rn '^<<<<<<< \|^>>>>>>> \|^=======$' --include='*.ts' --include='*.tsx' --include='*.css' --include='*.md' --include='*.mjs' .
```

实际 exit 0，10 行，不是期望的无输出：

```text
./node_modules/js-tokens/README.md:238:=======
./node_modules/.pnpm/js-tokens@4.0.0/node_modules/js-tokens/README.md:238:=======
./node_modules/.pnpm/format@0.2.2/node_modules/format/Readme.md:41:=======
./node_modules/.pnpm/argparse@1.0.10/node_modules/argparse/README.md:23:=======
./node_modules/.pnpm/argparse@1.0.10/node_modules/argparse/README.md:251:=======
./node_modules/.ignored/mammoth/node_modules/argparse/README.md:23:=======
./node_modules/.ignored/mammoth/node_modules/argparse/README.md:251:=======
./node_modules/mammoth/node_modules/argparse/README.md:23:=======
./node_modules/mammoth/node_modules/argparse/README.md:251:=======
./node_modules/format/Readme.md:41:=======
```

这些是依赖 Markdown 的标题分隔线。补充执行：

```sh
git grep -n -E '^(<<<<<<< |>>>>>>> |=======$)' -- '*.ts' '*.tsx' '*.css' '*.md' '*.mjs'
grep -rn '^<<<<<<< \|^>>>>>>> \|^=======$' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --include='*.ts' --include='*.tsx' --include='*.css' --include='*.md' --include='*.mjs' .
```

两者均无输出、exit 1（grep 无匹配的正常退出码）。因此源码无残留冲突，不能把原始全目录命令写成“无输出”。AC1 的“上游是 HEAD 祖先”要在提交 merge 后再验收，当前不宣称已完成。

## 2. ChatWindow 冲突解决 — PASS

通过 read 工具读取 `components/ChatWindow.tsx:1345–1379`、`:915–940`，并实际执行：

```sh
git diff --cached -- components/ChatWindow.tsx
git diff --cached MERGE_HEAD -- components/ChatWindow.tsx
```

关键原文：

```tsx
      {isEmptyNew && (
        <div className="mb-3 w-full" style={{ paddingLeft: 16, paddingRight: isMobile ? 16 : 52 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: "var(--chat-content-max-width, 820px)", margin: "0 auto", fontFamily: "var(--font-mono)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 10, minWidth: 0, flex: 1, lineHeight: 1.4, overflow: "hidden" }}>
              <Image src="/icons/apple-touch-icon.png" width={32} height={32} alt="" priority style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 22, color: "var(--text)", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>Pi Web</span>
              <NewSessionUpdateLink label={(version) => t("appUpdate.releaseNotes", { version })} />
```

```tsx
      {askUserCardInColumn}
      <div className="relative shrink-0">
        {chatInputElement}
        <ExtensionStatusBar statuses={extensionStatuses} widgets={extensionWidgets} />
      </div>
```

逐项核对：

| design §2.3 | 结果 |
|---|---|
| 品牌区在卡片前且位于 relative 包装外 | PASS，1351–1369 品牌区；1370 卡片；1371 开始包装 |
| 外层 mb-3 w-full、16/(16或52) padding | PASS，1352 |
| 内层 maxWidth + margin 0 auto | PASS，1353 |
| alignItems center | PASS，1353–1354 |
| 静态 Image，32×32、alt 空、priority | PASS，1355；import 在第 3 行 |
| composer 与 ExtensionStatusBar 在 relative shrink-0 内 | PASS，1371–1374 |
| 卡片在品牌区后、composer 前 | PASS，1370 |

`NewSessionUpdateLink` 在 1357，web/pi 的 `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_PI_VERSION` 行也保留。与 merge-execution 的结论一致。

## 3. A4 八项语义复核 — PASS

实际读取完整 staged diff（不含大锁文件），并比较 index 与 HEAD、MERGE_HEAD；另外使用 Python 按正则提取各文件的行号与原文、比较 JSON/key 集合。

主要 Git 命令：

```sh
git diff --cached -- . ':!package-lock.json'
git diff --cached MERGE_HEAD -- components/ChatWindow.tsx lib/worktree.ts AGENTS.md package.json
```

| 项 | 本次独立输出/审阅结果 |
|---|---|
| app/globals.css | 652 `.extension-widget-content`；657 `font-size: calc(14px + var(--chat-font-size-offset, 0px));`；700 定义 `--chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px)`；710、834 正文/代码复用 offset。相对 HEAD 仅 widget 一行变化 |
| lib/worktree.ts | 45 `PROJECT_CACHE_TTL_MS = 600_000`；54 `clearCachedProjectsOnDisk()`；57 `timeoutMs = 10_000`；59 `timeout: timeoutMs`；226 `WORKTREE_TIMEOUT = 5 * 60_000`，228/241 两条 add 路径都传超时；234/235 验证并采用 `refs/remotes/origin/${trimmed}`，失败回落 HEAD，无隐式 fetch |
| ChatWindow | 1607 标题 `whiteSpace: "pre-wrap", overflowWrap: "anywhere"`；1603 标题区 `maxHeight: "50%", overflowY: "auto"`；1691 `scrollMargin: 14`；26/53 Trellis snapshot 类型/回调仍在。相对 HEAD 的变化只有 Image import、品牌内容、两处扩展修复；未丢 personal hunk |
| AGENTS.md | 相对 HEAD 仅增加 UNC 与 Web password throttling 两段，未删任何 personal 段落；44 Session list scanning、66 On-demand session loading 仍在；222 UNC，239 Web password throttling |
| 三语 | Python 对比 HEAD 与现文件的 key 集合，en/zh-CN/zh-TW 均输出 `added_keys ['auth.tooManyAttempts'] removed_keys []`，三语占位符均为 `{seconds}` |
| package.json | `@xup3ng/pi-web 0.9.2 16.3.5 16.3.5`；将 next/eslint-config-next 两值还原到 HEAD 后，JSON 深比较输出 `other_package_fields_unchanged True`，fork 元数据、scripts、其余依赖均保留 |
| package-lock.json | 根与 packages[''] 均 `@xup3ng/pi-web 0.9.2`；next/eslint-config-next 16.3.5、sharp 0.35.4；相对 HEAD 改动的所有非根 block 与 MERGE_HEAD 内容相同。额外依赖范围的契约问题见第 7 组 |
| next.config.ts | 18 `images: { unoptimized: true },`；相对 HEAD 只有上游说明注释与此配置 |

跨层链路同时审阅：auth-throttle → route 的 401/429 + Retry-After → login 的 429 文案 → 三语 key；成功重置、globalThis/Symbol 共用状态、Lax cookie 均存在。UNC 编码保留首段根，新增测试覆盖 UNC、POSIX、Windows drive。上游 9 项变化均可定位，无发现合并丢失。

与 merge-execution 的语义结论一致。但其中用于证明合并结果的 `git diff 8366762..HEAD` 在 merge 未提交时只查看旧 HEAD，不能作为候选树证据；应改用 index/工作树比较。

## 4. 用户文件与越界保护 — FAIL（合并前 hash 证据缺失；当前保护检查 PASS）

实际执行：

```sh
sha256sum .pi/agents/trellis-{check,implement,research}.md components/AskUserCard.tsx components/AskUserCard.test.mjs
ls -la --time-style=full-iso .pi/agents/trellis-{check,implement,research}.md
git diff --cached --name-only
```

输出：

```text
1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf  .pi/agents/trellis-check.md
0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e  .pi/agents/trellis-implement.md
9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3  .pi/agents/trellis-research.md
006631bec7e78725109201ea4186447c010fb7d265c4ca69eb4fa9184db4cb4e  components/AskUserCard.tsx
d665b148bd7706827ccb9501f1097cc895e927b406da2d96e9a22fa740126d85  components/AskUserCard.test.mjs
```

mtime：check `2026-09-13 06:53:31.145810941 +0800`；implement `06:53:39.506993151`；research `06:53:47.363163936`。

将五个路径与 staged 集合求交，输出 `protected_staged []`。验证完成后执行：

```sh
sha256sum -c /tmp/pi-merge-check-ClPTpa/protected-before.txt
```

五个文件全部 `OK`。当前三份 agent hash 与 merge-execution 记录一致；本轮确实没有改动五个保护文件。

**差异/缺口**：merge-execution §2 自认 A0 时刻未保存 hash，却称 mtime 为“等价证据”。mtime 可保留或重设，不能证明字节级前后相同；本轮 hash 只能证明与此前合并后记录及本轮开始时一致。因此 R3/AC3 的“任务前后 SHA256 一致”无法严格验收，不能报告已证明被保护文件在整个合并期间未变。没有发现文件被破坏，但必须补可靠前置证据或明确申请接受证据缺口。

## 5. staged 集合 — PASS

实际执行 `git diff --cached --name-only`，并用 Python 将输出与委派给定的 19 路径集合求差：

```text
staged_count 19 missing [] extra []
protected_staged []
staged_files_with_unstaged_edits []
```

实际列表：

```text
AGENTS.md
app/api/web-auth/route.test.mjs
app/api/web-auth/route.ts
app/globals.css
app/login/page.tsx
components/ChatWindow.extension-request.test.mjs
components/ChatWindow.tsx
lib/auth-throttle.test.mjs
lib/auth-throttle.ts
lib/file-paths.test.mjs
lib/file-paths.ts
lib/i18n/messages/en.ts
lib/i18n/messages/zh-CN.ts
lib/i18n/messages/zh-TW.ts
lib/paths.test.mjs
lib/worktree.ts
next.config.ts
package-lock.json
package.json
```

与 merge-execution 相同。pnpm 锁仍是 unstaged，符合当前预定单独跟进提交的状态，但冻结 H 前必须纳入。

## 6. 验证复跑 — PASS（与 §4.2 全部一致；工作树验证含并发改动）

环境 `node -v` → `v26.1.0`。本轮实际执行并直接保存退出码，未用管道尾部成功冒充命令成功：

| 实际命令 | exit | 本次关键输出 | 对比 merge-execution §4.2 |
|---|---:|---|---|
| `node_modules/.bin/tsc --noEmit` | 0 | 无输出 | 一致 |
| `npm run lint` | 0 | `@xup3ng/pi-web@0.9.2 lint` / `eslint .`，无诊断 | 一致 |
| `npx eslint . -f json` | 0 | JSON 统计 files 462 / messages 0 / diagnostics [] | 一致 |
| `npm test` | 0 | tests 1239 / suites 10 / pass 1239 / fail 0 / cancelled 0 / skipped 0 / todo 0 | 一致 |
| `node --test lib/auth-throttle.test.mjs lib/file-paths.test.mjs lib/paths.test.mjs app/api/web-auth/route.test.mjs components/ChatWindow.extension-request.test.mjs` | 0 | tests 27 / pass 27 / fail 0 / skipped 0 | 一致 |
| `node --test components/ChatWindow.ask-user-layout.test.mjs`（额外） | 0 | tests 4 / pass 4 / fail 0 | 补充证据 |

JSON 统计实际使用：

```sh
node -e 'const x=require(process.argv[1]); console.log(JSON.stringify({files:x.length,messages:x.reduce((n,f)=>n+f.messages.length,0),diagnostics:x.filter(f=>f.messages.length)},null,2))' /tmp/pi-merge-check-ClPTpa/eslint.json
```

### 历史 14 条 lint 逐条对照

独立读取 `/tmp/baseline-lint.txt` 原始输出，而非只采用前次报告的数量；当前 eslint.json 诊断为空。所有条目规则均为 `react-hooks/preserve-manual-memoization`：

| 文件 | 基线位置 | 原始原因 | 本轮 |
|---|---|---|---|
| ChatInput.tsx | 936:41 | memoized in source but not compilation output | 不再出现 |
| ChatInput.tsx | 988:40 | 同上 | 不再出现 |
| ChatInput.tsx | 1441:41 | 同上 | 不再出现 |
| ChatInput.tsx | 1482:7 | dependency may be mutated later | 不再出现 |
| ChatInput.tsx | 1485:5 | memoized in source but not compilation output | 不再出现 |
| ChatInput.tsx | 1618:81 | dependency may be mutated later | 不再出现 |
| ChatInput.tsx | 1618:93 | 同上 | 不再出现 |
| ChatMinimap.tsx | 308:36 | inferred scrollContainer.current 与手写依赖不一致 | 不再出现 |
| ChatMinimap.tsx | 318:36 | 同上 | 不再出现 |
| ChatMinimap.tsx | 440:36 | 同上 | 不再出现 |
| ChatMinimap.tsx | 456:41 | 同上 | 不再出现 |
| ChatMinimap.tsx | 500:39 | 同上 | 不再出现 |
| SessionSidebar.tsx | 1157:44 | memoized in source but not compilation output | 不再出现 |
| SessionSidebar.tsx | 1185:30 | dependency may be mutated later | 不再出现 |

补充实际执行：

```sh
git diff --name-only HEAD -- components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx
npx eslint --print-config components/ChatInput.tsx | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>console.log("preserve-manual-memoization="+JSON.stringify(JSON.parse(s).rules["react-hooks/preserve-manual-memoization"])))'
```

前者无输出，后者 `preserve-manual-memoization=[2]`。所以本轮确认无新增诊断、规则仍启用且三文件未改；没有重新构造合并前 ad-hoc node_modules，不能独立证明旧依赖树具体哪一包导致 14 条诊断。R2 clean-install 基线不是本轮重跑，不将其写成本轮实测。

### 并发工作树耦合

实际 `git diff -- components/AskUserCard.tsx components/AskUserCard.test.mjs` 显示另一会话同步移除了问题/详情 maxWidth 及修改测试断言。全量日志实际包含：

```text
✔ questions use the full available width across details, options and custom input
✔ question details have breathing room and wrap long unbroken text
```

因此 1239 全绿验证的是“合并候选 + 两个未提交 AskUserCard 改动”的工作树，不能直接标为纯 index/冻结 H 的全量验证。本轮没有修改或隔离覆盖这两个文件。冻结发布源码前应在不含并发改动的隔离候选树上补验。

## 7. 依赖与锁 — FAIL（严格 R4/AC4；运行版本与 pnpm 最小化 PASS）

实际命令及输出：

```text
$ node -p "require('next/package.json').version"
16.3.5
$ npm ls next
@xup3ng/pi-web@0.9.2 /home/xupeng/dev/personal/forked/agegr-pi-web
└── next@16.3.5
# exit 0
$ grep -c 'next@16.3.1' pnpm-lock.yaml
0
# exit 1，表示无匹配，不是运行失败
$ grep -c 'next@16.3.5' pnpm-lock.yaml
6
# exit 0
```

实际读取完整 `git diff -- pnpm-lock.yaml`：只改 importer 的 next/eslint-config-next、next/@next/*/eslint-config-next packages/snapshots 及 `time: {}`；其它依赖（包括 parser 8.68.0、zod 4.4.3、sharp 0.35.4）未变。package.json 两个声明均为 16.3.5。

对 npm 锁用 Python JSON 比较 `HEAD:package-lock.json`、现文件、`MERGE_HEAD:package-lock.json`、`8366762:package-lock.json` 的 packages block，实际输出：

```text
lock_changed_blocks 46
npm changed vs upstream changed: extra= [] missing= ['node_modules/ignore', 'node_modules/ws']
changed non-root blocks unlike upstream= []
npm unstaged diff bytes= 0
```

即没有新增上游之外的变更 block；所有本次变化的非根 block 均等于上游版本，安装未额外修改 npm 锁。但是相对 personal HEAD 的 46 个变化 block **不只 Next 家族**，包含：

```text
node_modules/@eslint/eslintrc/node_modules/js-yaml 4.3.1 => 4.3.2
node_modules/@humanfs/core 0.19.1 => 0.19.2
node_modules/@humanfs/node 0.16.7 => 0.16.8
node_modules/@humanfs/types (新增) => 0.15.0
node_modules/@xmldom/xmldom 0.8.13 => 0.8.15
node_modules/fastq 1.20.1 => 1.20.3
# 另有 sharp 0.35.3 => 0.35.4、@img/sharp-*、libvips 1.3.2 => 1.3.3
```

**与 merge-execution 的关系**：§7 已披露这些额外变化，事实一致；但它不能据此自动将 PRD R4/AC4 的“两锁只含 next 家族变化”判为通过。来源于上游并不自动豁免明确范围限制。需用户确认保留上游完整锁更新并修订验收范围，或另行决定如何处理；本检查不擅自改锁。

## 8. 范围纪律与 spec — PASS（当前可观测状态；历史保证有限）

实际执行：

```sh
git status --porcelain -- scripts
git status --porcelain -- scripts .next
git tag --list 'pre-upstream-*'
git log --oneline -1
git rev-parse origin/personal
# test -f .next/BUILD_ID 后按分支输出是否存在
```

结果：scripts/.next 状态无输出；`.next/BUILD_ID` 不存在；tag 只有 `pre-upstream-860698a-20260918-141723`；HEAD 为 `391c141 fix: improve ask_user card readability and alignment`；origin/personal 为 `391c141260a6c8eb5dfc9a8457bcbfcf72055aad`。

本轮没有执行任何 build、push、tag 或写 index 操作。**上述现状不能反向证明历史上绝未 build/push**：构建产物可以删除，远端跟踪 ref 也不是远端操作审计日志。只报告本轮行为与可观测状态，不将缺乏产物当作绝对历史证明。

ask-user spec 的核心布局仍满足，实际原文：

```tsx
  const askUserCardInColumn = isEmptyNew && askUserCardElement ? (
    <div
      style={{
        padding: "0 16px 12px",
        paddingRight: isMobile ? 16 : 52,
      }}
    >
      {askUserCardElement}
    </div>
  ) : null;
```

空会话卡片处于 header/composer 之间，padding 与新品牌区一致；非空卡片仍在消息滚动列内。额外布局单测 4/4。

已知文档偏差：settings-dialog-mobile 的字号小节仍描述旧 `lib/chat-font-preference.ts` 整数 offset，而代码使用派生 `--chat-font-size-offset`；design §5 已识别，本次未修订 spec。另有任务文档矛盾：PRD 禁 tag、implement A1 又要求备份 tag；已存在的那个 tag 符合本次委派允许的预期，但不能称为“全程无 tag”。PRD 顶部仍写尚未 merge，与当前状态不一致。均应在任务记录阶段澄清，不通过更改历史证据掩盖。

## 总判定与必须修正项

**总判定：当前代码检查通过，但严格验收证据未闭合，不建议直接进入 A7 提交/冻结。** 未发现需要修改本次合并源码的缺陷。第 2、3、5、6 组 PASS；第 1、8 组在注明边界后 PASS；第 4、7 组因证据/契约缺口 FAIL。

按严重度排序：

1. **P1 — 明确 npm 锁范围决策（第 7 组）**：R4/AC4 与实际上游锁更新冲突。保留完整上游变更需要用户确认并更新验收描述，不应自行回退安全相关依赖，也不能静默豁免。
2. **P1 — 补齐或明确接受保护证据缺口（第 4 组）**：查找真实 A0 hash/可靠备份；若确实没有，报告“合并前 hash 未记录”，请用户接受限制。删除“mtime 等价证明”的结论，不能事后生成假基线。
3. **P1 — 隔离候选树验证**：当前 1239 测试全绿包含另一会话 AskUserCard 源码/测试。应在不修改主工作树的前提下验证实际拟提交/冻结树；pnpm 跟进锁也须纳入冻结源码。不能把本轮结果冒充 H 验证。
4. **P2 — 修正任务证据措辞**：补入历史 14 条 lint 逐条清单；区分 R1/R2 环境与本轮候选，原始 grep 的依赖误报；将 `base..HEAD` 旧树核对改为真正的候选 index 核对；更新过期状态，澄清备份 tag 与 dirty-worktree 保护例外、字号 spec 偏差。

完成上述证据/范围澄清并取得提交计划批准后，再决定 A7；本轮没有替用户提交，也没有启动发布。

未覆盖：E2E、真实浏览器中的品牌区/扩展标题换行/scroll-margin/image 行为/多标签 auth；没有隔离 build、tgz 审计、生产安装 smoke、publish dry-run 或发布验证。静态审阅和 Node 测试不替代这些检查。
