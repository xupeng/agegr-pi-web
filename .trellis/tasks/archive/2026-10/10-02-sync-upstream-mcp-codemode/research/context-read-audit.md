# Context read audit

After earlier tool-output truncation, curated task requirements and every referenced curated spec were reread completely in small explicit offset/limit slices. Pi README and the complete local docs/*.md set were likewise revisited; the relevant .md cross-references (SDK, MCP, extensions, exposure, prompts, sessions, events, RPC, configuration, security/isolation, resources, providers, TUI and platform guidance) were followed. SDK codemode/MCP example 14 was read completely. No SDK examples were executed against real credentials.

Local SDK package version: 0.99.1. Reference directory is the developer-designated read-only main checkout node_modules path; candidate dependencies remain separate.

| Local SDK reference | Complete line count |
| --- | ---: |
| `README.md` | 70 |
| `docs/cli-integration.md` | 106 |
| `docs/cli.md` | 329 |
| `docs/compaction.md` | 463 |
| `docs/configuration.md` | 47 |
| `docs/containerization.md` | 183 |
| `docs/custom-provider.md` | 173 |
| `docs/environment-variables.md` | 98 |
| `docs/extensions.md` | 270 |
| `docs/how-pi-works.md` | 49 |
| `docs/index.md` | 39 |
| `docs/json.md` | 226 |
| `docs/keybindings.md` | 194 |
| `docs/llama-cpp.md` | 114 |
| `docs/mcp.md` | 188 |
| `docs/message-types.md` | 261 |
| `docs/models.md` | 158 |
| `docs/packages.md` | 129 |
| `docs/prompt-templates.md` | 59 |
| `docs/providers.md` | 188 |
| `docs/quickstart.md` | 122 |
| `docs/rpc-commands.md` | 860 |
| `docs/rpc-extension-ui.md` | 200 |
| `docs/rpc.md` | 193 |
| `docs/sdk.md` | 147 |
| `docs/security.md` | 99 |
| `docs/session-format.md` | 293 |
| `docs/sessions.md` | 66 |
| `docs/settings.md` | 167 |
| `docs/shell-aliases.md` | 93 |
| `docs/skills.md` | 93 |
| `docs/slash-commands.md` | 60 |
| `docs/terminal-setup.md` | 219 |
| `docs/termux.md` | 117 |
| `docs/themes.md` | 136 |
| `docs/tmux.md` | 55 |
| `docs/tui.md` | 125 |
| `docs/usage.md` | 94 |
| `docs/virtual-models.md` | 114 |
| `docs/windows.md` | 67 |

Behavioral evidence is the candidate real SDK/faux/local-fixture tests; reading documentation is not counted as a passing test or browser run.
