# Publishing Guide

How to publish the `better-cli` skill to every agent skill marketplace.

## Manifests Included

This repo ships with manifests for all major platforms:

| File | Platform | Format |
|------|----------|--------|
| `SKILL.md` | Agent Skills standard, Claude Code, skills.sh, ClawHub, SkillsMP, SkillHub, Playbooks, LobeHub | YAML frontmatter + Markdown |
| `.claude-plugin/plugin.json` | Claude Code Plugin system | JSON |
| `package.json` | npm registry, skillpm | JSON |
| `claw.json` | ClawHub (OpenClaw) | JSON |
| `AGENTS.md` | GitHub Copilot, Codex CLI, Gemini CLI, Aider, 60+ tools | Markdown |
| `.github/copilot-instructions.md` | GitHub Copilot (repo-level) | Markdown |
| `.cursor/rules/better-cli.mdc` | Cursor | MDC (Markdown with frontmatter) |
| `.windsurf/rules/better-cli.md` | Windsurf / Codeium | Markdown with trigger frontmatter |
| `.clinerules/better-cli.md` | Cline | Markdown |

---

## 1. Vercel Skills.sh

**The primary marketplace.** Skills appear automatically when users install from a public GitHub repo.

```bash
# Users install with:
npx skills add yogin16/better-cli

# Install globally:
npx skills add yogin16/better-cli -g

# Install for specific agents:
npx skills add yogin16/better-cli -a claude,cursor,copilot
```

**To publish:** Push to a public GitHub repo. No registration needed. Usage is tracked automatically and the skill appears on [skills.sh](https://skills.sh/) once installed.

**To verify listing:**
```bash
npx skills find "better-cli"
```

---

## 2. Claude Code (Direct Skill)

Users can install manually or via the plugin system.

**Manual install:**
```bash
# Project-level (just this repo)
mkdir -p .claude/skills/better-cli
cp SKILL.md .claude/skills/better-cli/
cp -r references/ .claude/skills/better-cli/

# User-level (all projects)
mkdir -p ~/.claude/skills/better-cli
cp SKILL.md ~/.claude/skills/better-cli/
cp -r references/ ~/.claude/skills/better-cli/
```

**Via skills.sh:**
```bash
npx skills add yogin16/better-cli -a claude
```

---

## 3. Claude Code Plugin Marketplace

The `.claude-plugin/marketplace.json` lets users install via the plugin system.

**Users install with:**
```
/plugin marketplace add yogin16/better-cli
/plugin install better-cli@yogin16
```

**To also list on the official Anthropic marketplace:**
Open a PR to [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) adding your plugin entry.

---

## 4. ClawHub (OpenClaw)

**Prerequisites:**
- GitHub account at least 1 week old
- `clawhub` CLI installed

```bash
# Install ClawHub CLI
npm install -g clawhub

# Login
clawhub login

# Publish (from repo root)
clawhub publish
```

The `claw.json` manifest is already included. ClawHub will scan for `SKILL.md` and `claw.json`, run VirusTotal checks, and list the skill.

**Verify:**
```bash
clawhub search better-cli
```

---

## 5. npm Registry

For distribution via npm and skillpm.

```bash
# Login to npm
npm login

# Publish
npm publish

# Users install with skillpm:
npx skillpm install better-cli

# Or with skills.sh:
npx skills add better-cli  # if npm source is supported
```

The `package.json` includes `"keywords": ["agent-skill"]` for discovery on [skillpm.dev/registry](https://skillpm.dev/registry/).

**Scoped publishing (optional):**
```bash
# If you want @yogin/better-cli
npm publish --access public
```

---

## 6. SkillsMP (Aggregator)

**No action needed.** SkillsMP auto-indexes skills from public GitHub repos with 2+ stars. Once your repo has stars and contains a valid `SKILL.md`, it will appear at [skillsmp.com](https://skillsmp.com).

**To accelerate:** Get the repo to 2+ stars and ensure `SKILL.md` is at the repo root.

---

## 7. SkillHub

**No action needed.** SkillHub auto-indexes from GitHub. Ensure `SKILL.md` is valid and the repo is public.

---

## 8. LobeHub

```bash
# Submit for review
npx -y @lobehub/market-cli skills comment
```

Follow the interactive prompts. Skills are reviewed before listing.

---

## 9. Playbooks.com

1. Go to [playbooks.com/skills](https://playbooks.com/skills)
2. Login with GitHub
3. Submit your repo URL
4. Wait for review

---

## 10. GitHub Copilot

The `AGENTS.md` and `.github/copilot-instructions.md` files are already included. When this repo is cloned or used as a template, Copilot will automatically pick up the instructions.

**No separate publishing needed.** The files work by being present in the repo.

---

## 11. Cursor

The `.cursor/rules/better-cli.mdc` file is already included. When this repo is cloned, Cursor will automatically detect the rule.

**For users who want to install globally:** Copy the rule file:
```bash
mkdir -p ~/.cursor/rules
cp .cursor/rules/better-cli.mdc ~/.cursor/rules/
```

---

## 12. Windsurf / Codeium

The `.windsurf/rules/better-cli.md` file is already included. Windsurf detects it automatically.

**For global installation:**
```bash
mkdir -p ~/.codeium/windsurf/memories/
cat .windsurf/rules/better-cli.md >> ~/.codeium/windsurf/memories/global_rules.md
```

---

## 13. Cline

The `.clinerules/better-cli.md` file is already included. Cline detects it automatically when the repo is open.

**For global installation:**
```bash
# macOS / Linux
mkdir -p ~/Documents/Cline/Rules
cp .clinerules/better-cli.md ~/Documents/Cline/Rules/

# Windows
mkdir -p "$HOME/Documents/Cline/Rules"
cp .clinerules/better-cli.md "$HOME/Documents/Cline/Rules/"
```

---

## 14. Aider

Aider uses convention files loaded at startup.

**Users add to `.aider.conf.yml`:**
```yaml
read: SKILL.md
```

Or load in-session:
```
/read SKILL.md
```

**No separate publishing needed.**

---

## Quick Publish Checklist

```
[ ] Push to public GitHub repo (yogin16/better-cli)
[ ] npx skills find "better-cli" — verify skills.sh listing
[ ] npm publish — list on npm registry
[ ] clawhub publish — list on ClawHub
[ ] PR to anthropics/claude-plugins-official — official Claude marketplace
[ ] npx -y @lobehub/market-cli skills comment — LobeHub submission
[ ] Submit at playbooks.com/skills — Playbooks listing
[ ] Get 2+ GitHub stars — triggers SkillsMP and SkillHub indexing
```

## Updating Across Marketplaces

When you update the skill:

1. Bump `version` in `SKILL.md` frontmatter, `package.json`, `claw.json`, and `.claude-plugin/plugin.json`
2. `git commit` and `git push`
3. `npm publish` (npm/skillpm)
4. `clawhub publish` (ClawHub)
5. skills.sh, SkillsMP, SkillHub auto-update from GitHub
6. Cursor, Windsurf, Cline, Copilot auto-detect from repo files

## Version Sync Script

To keep versions consistent across all manifests:

```bash
VERSION="1.1.0"

# package.json
npm version $VERSION --no-git-tag-version

# claw.json
jq ".version = \"$VERSION\"" claw.json > tmp && mv tmp claw.json

# plugin.json
jq ".version = \"$VERSION\"" .claude-plugin/plugin.json > tmp && mv tmp .claude-plugin/plugin.json

# SKILL.md frontmatter (update the version line)
sed -i '' "s/version: \"[0-9.]*\"/version: \"$VERSION\"/" SKILL.md
```
