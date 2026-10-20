When building or improving CLI tools, follow the better-cli skill guidelines in SKILL.md.

Key rules:
- stdout for data, stderr for diagnostics — never mix
- Support --json with consistent envelope for all commands
- Every error must be actionable: what happened, context, fix command
- Every prompt must have a flag bypass (--yes, --force, etc.)
- Output must guide the next action (suggest follow-up commands)
- Respect NO_COLOR and TTY detection
- Use semantic exit codes (0=ok, 2=usage, 3=not-found, 4=permission, 75=transient)
- Prefer flags over positional arguments
- Never accept secrets via command-line flags
