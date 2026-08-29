# 实施记录

## 已确认的计划（用户 3 项决策）
- 触发：push `personal-*` tag 自动 build+release
- 版本号：本地 bump+commit+push tag，CI 不管理版本
- 产物：保持预构建 tarball，不推 npm registry

## 实施步骤
- [x] 调研：package.json `files` 已含 `.next`/`bin`/`public`（tarball 即部署物，无需改动）；pnpm-lock.yaml lockfileVersion 9（pnpm 10）；现有 tag 格式 `personal-0.8.9.2`
- [x] `.github/workflows/release-personal.yml`：push `personal-*` tag 触发，contents: write（GITHUB_TOKEN）
  - checkout fetch-depth 0（全量 tag 算上一版 changelog）→ pnpm/action-setup v10 → node 22 + pnpm cache
  - tag 解析版本：`personal-0.8.9.2` → `0.8.9-personal.2`（本地 bash 模拟验证通过）
  - 防护 1：package.json version 与 tag 不一致时 fail（防手打 tag 生成错误 tarball 名）
  - 防护 2：上一版本用 `git tag -l 'personal-0.8.*' | sort -V | grep -v "^$TAG$"` 排除当前 tag
  - pnpm install --frozen-lockfile → npm run build（next build --webpack）→ npm pack
  - gh release create，notes 照搬原脚本（changelog + npm/pnpm 安装命令）
- [x] `scripts/release-personal.sh` 瘦身：只保留前置检查 + bump + commit + push 分支 + push tag；删除 next build / npm pack / gh release create；去掉 gh 依赖检查；保留本地代理
- [x] 验证：bash -n 通过；PyYAML 解析通过（on 关键字为 YAML 1.1 布尔怪癖，GitHub 正常处理）；tag 解析 2 个用例通过；步骤清单 10 步齐全
- [ ] 提交

## 备注
- 不真正推送 tag 触发 CI（需要真实发布，由用户下次发版时验证）
- actionlint 本机不可用（npx 无法执行），以 yaml 解析 + bash 语法检查替代
