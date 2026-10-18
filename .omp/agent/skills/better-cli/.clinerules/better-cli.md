# Better CLI Rules

When building or improving CLI tools:

- stdout = data only. stderr = errors, warnings, progress. Never mix.
- Support `--json` with consistent envelope: `{"status": "ok|error", "data": {...}}`
- Output guides the next action — suggest follow-up commands on success, fix commands on failure
- Semantic exit codes: 0=success, 2=usage, 3=not-found, 4=permission, 75=transient
- Every error: what + context + fix command + docs reference
- Every prompt has a flag bypass (`--yes`, `--force`, `--name=value`)
- No ANSI escape codes when piped; respect `NO_COLOR` env var
- Prefer flags over positional arguments
- Config precedence: flags > env vars > config files > defaults
- Never accept secrets via command-line flags
- Support `--fields`, `--quiet`, `--dry-run`
- Create commands must output the created resource identifier

Full guide: see SKILL.md
