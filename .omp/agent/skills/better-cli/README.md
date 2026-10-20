# better-cli

An Agent Skill that teaches AI agents best practices for building and improving CLIs that work for both humans and AI agents.

## Install

**Claude Code / skills.sh** (40+ agents supported):
```bash
npx skills add yogin16/better-cli
```

**Claude Code Plugin:**
```
/plugin marketplace add yogin16/better-cli
/plugin install better-cli@yogin16
```

**npm / skillpm:**
```bash
npx skillpm install better-cli
```

**Manual** (any agent):
Copy `SKILL.md` and `references/` into your project's skill directory.

## What This Skill Does

When an AI agent is building, designing, reviewing, or improving a CLI tool — new or existing — this skill activates and guides it to follow best practices that make CLIs excellent for **both** human users at a terminal and AI agents in automation pipelines.

### Key Principles

- **Output that guides the next action** — every command tells you what to do next
- **stdout for data, stderr for everything else** — clean separation enables piping
- **Structured output** (`--json`) — consistent envelope for machine consumption
- **Actionable errors** — code + message + fix command + retry hint
- **No interactive requirements** — every prompt has a flag bypass
- **TTY-aware** — adapts output for terminals vs pipes automatically

### The Core Insight

> The output of your CLI commands should be interpretable and navigable. An AI agent reading the output should know exactly what to do next — without guessing, without hallucinating commands, without stalling.

This is what separates a CLI that *works* with AI agents from one that *fights* them.

## Platform Support

This repo ships with manifests for all major agent platforms:

| Platform | Manifest | Auto-detected |
|----------|----------|---------------|
| Claude Code | `SKILL.md` + `.claude-plugin/plugin.json` | Yes |
| skills.sh | `SKILL.md` | Yes (40+ agents) |
| ClawHub (OpenClaw) | `SKILL.md` + `claw.json` | Via `clawhub publish` |
| npm / skillpm | `package.json` | Via `npm publish` |
| GitHub Copilot | `AGENTS.md` + `.github/copilot-instructions.md` | Yes |
| Cursor | `.cursor/rules/better-cli.mdc` | Yes |
| Windsurf | `.windsurf/rules/better-cli.md` | Yes |
| Cline | `.clinerules/better-cli.md` | Yes |
| Aider | `SKILL.md` (via `/read`) | Manual |
| SkillsMP / SkillHub | `SKILL.md` | Auto-indexed from GitHub |

See [PUBLISHING.md](PUBLISHING.md) for full publishing instructions for each platform.

## Skill Structure

```
SKILL.md                            # Core: 17 rules, 8 anti-patterns, decision tree, checklist
references/
  output-design.md                  # JSON envelopes, NDJSON, field selection, versioning
  agent-patterns.md                 # How AI agents consume CLIs, MCP wrapping, token efficiency
  error-handling.md                 # Exit codes (sysexits.h), structured errors, signal handling
  interactivity.md                  # TTY detection (Node/Python/Go/Rust), NO_COLOR, prompts
  composability.md                  # Pipe patterns, stdin, cross-command chaining
  discoverability.md                # Help text, shell completions, schema introspection
  security.md                       # Secret handling, input validation, agent-safe patterns
  testing.md                        # Output contract tests, CLI integration tests, CI validation

Platform manifests:
  .claude-plugin/plugin.json        # Claude Code plugin
  .claude-plugin/marketplace.json   # Claude Code marketplace listing
  claw.json                         # ClawHub / OpenClaw
  package.json                      # npm / skillpm
  AGENTS.md                         # GitHub Copilot / generic agents
  .github/copilot-instructions.md   # GitHub Copilot (repo-level)
  .cursor/rules/better-cli.mdc      # Cursor
  .windsurf/rules/better-cli.md     # Windsurf / Codeium
  .clinerules/better-cli.md         # Cline
```

## Who This Is For

- **AI agents** (Claude Code, Copilot, Cursor, Codex, Gemini CLI, etc.) building CLI tools in any language
- **Developers** who want their CLIs to be AI-agent-friendly without sacrificing human UX
- **Teams** standardizing CLI design patterns across projects

## Scope

This skill targets **command-based CLIs** — tools with subcommands, flags, and structured output (like `git`, `docker`, `gh`, `kubectl`). It does **not** cover full-screen TUI apps, interactive dashboards, or GUI applications.

## License

Apache-2.0
