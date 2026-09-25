# Paired ask_user metadata evaluation (2026-09-25)

## Setup

- SDK `0.85.1`, `sub2api-codex/gpt-6-sol`, `minimal` thinking, 24 independent fresh sessions, 3 trials per scenario and metadata version. Old metadata comes from `922f7e1:lib/ask-user/tool.ts`; current metadata from the checked-out merged tool. The system prompt differs only in its `ask_user` snippet/guideline when the tool is available (verified by `--self-check`). No other built-in tools, context files, extensions, skills or themes were loaded. The unavailable control has zero tools on both sides.
- Fixed prompts: blocking fact, `Update the migration for our production database, but I have not told you which database we use.`; blocking choice, `Export this report. I need to choose CSV or JSON before you implement it.`; nonblocking, `The export works now. Anything else I could consider later?`; unavailable, the same migration prompt with `ask_user` removed.
- The fake host `open` records tool invocation and returns `terminate: true`, but does not show a browser card or wait for answers. This measures the model's first-turn choice, not the production end-to-end protocol or a live before/after rollout. The unavailable control does not reproduce Pi Web's Chat-only system prompt.

## All trials

`ask_user` means one successful tool invocation; `prose` means no tool call and a text response. No run had a provider, environment or harness error; no SDK retry occurred.

| Scenario | Old 1 / 2 / 3 | New 1 / 2 / 3 | Notes |
| --- | --- | --- | --- |
| Missing database fact | prose / ask_user / ask_user | ask_user / ask_user / ask_user | Old trial 1 asked for database type and migration details in text. The five cards requested database/version, migration framework and/or change scope. |
| CSV vs JSON decision | ask_user / ask_user / ask_user | ask_user / ask_user / ask_user | Each card requested a format choice. |
| Optional later advice | prose / prose / prose | prose / prose / prose | All six answered with nonblocking suggestions; no card. |
| Tool unavailable | prose / prose / prose | prose / prose / prose | All six asked for missing database details in text; no unavailable tool call. |

There were 11 `ask_user` turns and 13 prose turns overall; zero neither/errored turns. In the two blocking cases together, the old metadata yielded 5/6 card calls and the new metadata yielded 6/6. The nonblocking and unavailable controls both yielded 0/3 card calls per side. This small unrandomized comparison supports only these observations: it does not establish a general call-rate improvement, statistical significance, provider-independent compliance, or answer-delivery correctness.

## Per-trial observations

Each `ask_user` row records the questions passed to the tool (one successful call, no prose answer); multiple questions are joined in the cell, and each question string matches the tool argument exactly. Each `prose` row records the assistant text. Markdown table cells collapse internal newlines to single spaces; the ignored JSON keeps the original line breaks, and the collapsed text matches that JSON after whitespace normalization. The prompts are synthetic and the output below contains no private conversation data. Every row has zero retries and no provider/environment/harness error. Version `old` is `922f7e1`; `new` is the checked-out guidance. Option values, question details, call IDs and durations remain in the local ignored JSON report.

| Scenario | Version | Trial | Outcome | Actual questions or prose |
| --- | --- | ---: | --- | --- |
| Missing fact | old | 1 | prose | 要更新生产数据库的迁移，我需要先确认数据库类型和迁移工具。请提供数据库类型（如 PostgreSQL 或 MySQL）、使用的迁移工具，以及这次需要变更的表结构或数据。拿到这些信息后，我会先检查现有迁移和部署流程；在确认方案前不会对生产库执行操作。 |
| Missing fact | old | 2 | ask_user | 生产环境使用哪种数据库及版本？；这次迁移需要实现什么变更？；你希望这次工作的执行范围是什么？ |
| Missing fact | old | 3 | ask_user | 生产环境使用哪种数据库及版本？使用什么迁移框架？；这次迁移具体需要修改什么？；你希望我做到哪一步？ |
| Missing fact | new | 1 | ask_user | Which production database and migration framework are you using?; What change should the migration make? |
| Missing fact | new | 2 | ask_user | Which database engine/version and migration framework does production use?; What change should the production migration make? |
| Missing fact | new | 3 | ask_user | 生产环境使用哪种数据库和迁移工具？相关迁移文件在哪里？；这次迁移具体要做什么变更？ |
| Format choice | old | 1 | ask_user | 这份报告要导出为哪种格式？ |
| Format choice | old | 2 | ask_user | 这份报表要导出为哪种格式？ |
| Format choice | old | 3 | ask_user | 这份报告要导出为哪种格式？ |
| Format choice | new | 1 | ask_user | 这份报告要导出为哪种格式？ |
| Format choice | new | 2 | ask_user | 这份报告要导出为 CSV 还是 JSON？ |
| Format choice | new | 3 | ask_user | 这份报告要导出为哪种格式？ |
| Later advice | old | 1 | prose | 既然导出已经能正常工作，后续可以考虑这几项，但不必现在都做： - 用一次真实数据做端到端验证，确认文件内容、格式和导入方的兼容性。 - 覆盖空数据、大数据量和特殊字符等边界情况。 - 如果导出可能耗时较长，再考虑进度提示、取消操作和失败后的重试。 优先级取决于实际使用情况；目前没有必要为了这些可能性继续改动。 |
| Later advice | old | 2 | prose | 可以留意这几项后续改进，不必现在都做： - 给导出流程加一两个回归测试，覆盖空数据、特殊字符和较大文件。 - 检查导出失败时的提示，以及重复点击是否会触发多次下载。 - 如果数据量可能增长，关注生成文件时的内存占用和响应时间。 - 确认文件名、格式和时区在不同浏览器中的表现符合预期。 既然目前已经正常工作，优先补最容易再次出问题的测试即可。 |
| Later advice | old | 3 | prose | 可以稍后考虑这几项，不必现在都做： - **边界情况**：空数据、大文件、特殊字符，以及导出过程中断时的表现。 - **用户反馈**：导出耗时较长时显示进度，完成或失败时给出明确提示。 - **回归测试**：为导出格式和关键字段加一两个测试，避免后续改动意外影响结果。 如果目前使用频率不高，先观察实际使用中的问题，再决定优先级就够了。 |
| Later advice | new | 1 | prose | 可以以后再考虑几项，不急着现在做： - 用包含特殊字符、空数据和大文件的样例验证导出结果。 - 检查文件名、格式和编码在不同浏览器中的表现。 - 如果导出可能耗时较长，加入进度提示或失败后的重试入口。 如果目前的使用场景都正常，先保持现状即可。 |
| Later advice | new | 2 | prose | 既然导出已经正常工作，后续可以考虑三件事：给导出流程加一个回归测试；检查大数据量导出时的耗时和内存占用；确认文件名、格式以及失败提示符合用户预期。这些都不急，按实际使用中遇到的问题安排即可。 |
| Later advice | new | 3 | prose | 既然导出已经正常工作，后续可以考虑几项优化：用包含空数据、特殊字符和大数据量的样例做回归测试；确认导出失败时有清晰提示；如果文件可能很大，再评估进度提示或后台生成。这些都可以按实际使用情况安排，不必现在做。 |
| Unavailable | old | 1 | prose | 生产数据库的类型还不明确，我不能安全地修改迁移。请提供数据库类型和版本（例如 PostgreSQL 16 或 MySQL 8），以及要变更的表结构或数据；有迁移文件路径的话也请一并提供。 |
| Unavailable | old | 2 | prose | 在修改生产数据库迁移之前，需要确认数据库类型及其版本，例如 PostgreSQL 16 或 MySQL 8。还需要知道要做的 schema 变更，以及项目使用的迁移工具；否则无法安全地编写或验证迁移。 |
| Unavailable | old | 3 | prose | 需要先确认生产数据库的类型（例如 PostgreSQL、MySQL 或 SQLite）、当前版本，以及要做的具体变更。请提供这些信息或指出项目中的数据库配置和迁移目录；在确认之前，我不会修改或运行生产迁移。 |
| Unavailable | new | 1 | prose | 需要先确认生产数据库的类型和版本（例如 PostgreSQL 16 或 MySQL 8），以及要迁移的具体结构或数据变更。请提供这些信息，或指出现有迁移文件和目标 schema；在确认前我不会修改生产迁移。 |
| Unavailable | new | 2 | prose | 在修改生产数据库迁移前，需要先确认数据库类型（例如 PostgreSQL、MySQL 或 SQLite），以及要做的表结构或数据变更。请提供这两项信息；在确认前我不会修改迁移或执行数据库操作。 |
| Unavailable | new | 3 | prose | 要修改生产数据库迁移，我需要先确认数据库类型（例如 PostgreSQL、MySQL 或 SQLite）、所用的迁移工具，以及你希望变更的表结构或数据。请提供这些信息；在确认前我不会修改或运行迁移。 |

## Evidence and cleanup

- This tracked record contains all 24 outcomes and verbatim question/prose observations. Supplementary local JSON and rendered Markdown, including tool arguments, configuration, duration and retry count: `test-results/ask-user-behavior-eval/ask-user-behavior-report.{json,md}` (gitignored; do not publish without manual privacy review). Run ID `bb6efaf8-3883-4784-a240-fb7d1f23540f`.
- CLI reported 24/24 completed, `cleanup.status=removed`, `notRun=0`, `setupError=null`; the isolated run root was removed. Three empty `/tmp/pi-ask-user-eval-*` directories left by offline self-check fixtures were removed using `rmdir`. No session was created in the normal `~/.pi/agent/sessions` tree.
