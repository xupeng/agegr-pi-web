# 设计：0.10.0 的隔离构建与发布

## 隔离边界与目录布局

```
/home/xupeng/dev/personal/forked/
  agegr-pi-web/                        # 主 checkout：只读基线，绝不在这里 build
  .pi-web-v095-release-20260919-220023/ # 0.9.5 root（脚本模板来源，3.5G）
  .pi-web-v0100-release-<ts>/           # 本次 root（新建）
    env.sh           # 隔离环境（HOME/XDG/PI_CODING_AGENT_DIR/TMPDIR/NPM_CONFIG_* 全指向 root）
    npmrc            # registry 固定 registry.npmjs.org
    check-run.py     # 跑命令 + 写 check/<name>.json（exit/duration/log 路径）
    smoke.sh         # 起服务 + HTTP 探针
    b9-publish.sh    # 用户终端执行的真实发布（内含期望 sha256 校验）
    b10-verify.sh    # 远端版本/产物有界核验
    src/             # git archive 导出的 H（无 .git）
    artifacts/       # 封存的 tgz
    evidence/        # H.txt / H-tree.txt / BUILD_ID.txt / SHA256SUMS / filelist.txt / 探针输出
    logs/ check/     # 每步日志与退出码
```

**不使用 `/tmp`**：本机 `/tmp` 是 2 GiB tmpfs，`node_modules` + `.next` 会 `ENOSPC`。

## 数据流：从冻结提交到可发布产物

```
personal@H ──git archive──▶ $ROOT/src（无 .git）
                              │ npm version 0.10.0（仅 package.json + package-lock.json）
                              │ npm ci（隔离 cache）
                              │ TURBOPACK= npm run build   ← 唯一允许 build 的位置
                              ▼
                          .next/（BUILD_ID 记录）
                              │ npm pack
                              ▼
                    artifacts/xup3ng-pi-web-0.10.0.tgz
                              │ sha256 封存 + 清单审计 + 字体许可核验
                              │ 全局安装（$ROOT/install）→ smoke.sh 探针
                              │ npm publish --dry-run（清单一致性）
                              ▼
                       [GATE] 用户终端 bash b9-publish.sh（2FA，不可逆）
                              ▼
                   B10 远端核验（npm view + 远端 tgz 对比）
                              ▼
              主 checkout：bump 到 0.10.0 → commit → push personal
```

## 关键设计决策

| 决策 | 选择 | 理由 / 备选 |
|---|---|---|
| root 来源 | **复用 0.9.5 root 的脚本**（cp 后改版本串） | 0.9.5 root 仍在磁盘、脚本经过一次真实发布验证；备选（从 archive 重建）更慢且无收益 |
| 版本 bump 位置 | 隔离 `src/` 内，主 checkout 到 B11 才动 | 沿用 0.9.5 已验证流程：任何一步失败，主 checkout 仍停在 0.9.5，不产生"半个发布" |
| 打包对象 | `npm pack` 出的 tgz，而不是 registry 端重打包 | 让本地封存件与发布件可比对（B10 的核验基准） |
| 发布执行者 | **用户**在自己终端跑 `b9-publish.sh` | 2FA 需要浏览器授权，自动化无法代跑；脚本内先 `sha256sum -c` 校验封存件，避免手滑发错文件 |
| 字体许可 | 降级为回归项（`fonts.test.mjs` + 包内文件检查） | 0.9.5 已把它作为独立验收点审计过，本次只需防止回归 |
| 旧 root 清理 | 发布成功后**征询用户**再删 | 3.5G 但可作为回滚参照；擅自删用户磁盘内容不可接受 |

## 失败与回滚

| 失败点 | 现象 | 处置 |
|---|---|---|
| H 漂移 | 冻结后发现 `personal` 前进或有业务改动 | 已封存产物作废，从新 H 重跑 B2–B7；不得混用 |
| `npm version` churn | 改动超过 package.json 1 行 + lock 2 行 | 停止，人工确认后再决定是否接受 |
| 构建/冒烟失败 | B4 或 B6 退出码非 0 | 修复只能改隔离 `src/` 的**发布配置**（不影响主 checkout）；若需改产品代码则中止本任务，回到开发流程 |
| dry-run 清单不符 | B7 与 B5 清单不一致 | 阻断发布，先解释差异 |
| 发布后核验失败 | B10 拿不到 0.10.0 | 不可逆：必要时用 `npm deprecate` 标注并立即定位；报告必须写明实际状态，不得含糊 |
| 发布前用户未登录 | `npm whoami` E401 | 门前置：请用户 `npm login` 后再批准 |

## 运维注意

- 主 checkout 的 dev server 当前已停止；发布全程不会在主 checkout 执行 build 或改动 `.next`。
- 每次 build 前确认 `env.sh` 生效（`env | grep -E 'NPM_TOKEN|NODE_AUTH_TOKEN|PROXY'` 应无输出），
  避免真实凭据/代理泄漏进隔离环境。
- 磁盘：`/` 可用 53G，本次 root 约 3.5G，安全。
