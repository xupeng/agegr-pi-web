# 同步上游更新

## Goal

将 agegr/pi-web 的最新 main 合入本 fork，保留 personal 自定义功能，验证后交付可评审的同步分支。

## Background

- 用户已同意创建任务、批准最终规划和实施；中断后要求继续。
- 2026-10-03 实测 personal 基线为 `8d376f3b1b98adf91f2ae651a7188745b1f563fd`，初始工作树干净。
- 上游 remote 为 `for-sync`，其 fetch refspec 实际写入 `refs/remotes/upstream/*`；不能把旧的 `for-sync/main` 当作实时上游。已用 `git ls-remote` 核实并显式 fetch main。
- 本次固定上游目标为 `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`（Release v0.10.0），包含 47 个尚未合入的提交，155 文件、37569 新增行、1652 删除行；上游无删除文件。
- 上游主要新增 MCP 设置、连接测试、OAuth、导入及项目信任能力，Pi 四个 SDK 包从 0.99.1 升到 1.0.0，package-lock.json 同时变化。

## Requirements

- R1：使用固定目标进行非快进合并，保留上游提交可达性，不重写 personal 历史。
- R2：冲突逐块整合，保留 fork 包名、版本、发布配置及已存在的交互、工具、Trellis 和文件授权契约；禁止整文件选 ours/theirs。
- R3：同步 SDK 和锁文件，在独立工作树以 `npm ci --include=dev` 建立可复算依赖环境，不扰动当前开发服务。
- R4：先隔离预演冲突，实施后复核双方都修改的文件与 SDK 迁移边界，并记录验证证据。
- R5：保留 `@xup3ng/pi-web@0.12.0` 及 fork 发布元数据；同步 portable ask_user 的两个 SDK peer pin 和发现测试，避免宿主与 portable SDK 身份分裂。

## Acceptance Criteria

- [x] AC1（R1）：固定上游目标是结果 HEAD 的祖先。
- [x] AC2（R2、R5）：无未解决冲突或误删 fork 文件；fork 包元数据与自定义契约保留，portable SDK pin 与宿主一致。
- [x] AC3（R3）：依赖版本与锁文件一致，类型检查、lint、npm test 完成并与实测基线对照。
- [x] AC4（R4）：重点语义复核和验证结果写入 research；真实浏览器未覆盖项明确列为残余风险。

## Out of Scope

- 不发布 npm 包、不更新 changelog、不升级 Trellis、不重启当前服务。
- 不自动推送、创建或合并 PR；此类远端交付操作需要用户另行要求。

## Risks and Deferred Coverage

- 隔离预演确认 14 个冲突，名单与证据见 research/planning.md；当前开发工作树与服务未被合并操作改动。
- MCP 设置新增范围较大，SDK 1.0.0 的真实运行时兼容性必须在实施后验证，不能从类型检查推断成功。
- 真实浏览器测试优先使用隔离环境；环境阻塞时记录未覆盖，不代称通过。Safari 16.2、Windows 真机和真实外部 OAuth / 模型服务不在本次验收范围。

## Artifact Status

验收完成，用户已确认五批本地提交方案。合并提交 `18a284d`、spec 提交 `b9c5bcb` 已形成；2757 单测、类型/lint、完整 Chromium e2e 与设置 smoke 全部通过。任务产物随后归档并记录日志，始终留在任务分支；不自动进行远端交付。
