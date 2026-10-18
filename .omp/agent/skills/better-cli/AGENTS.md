# CLI Development Guidelines

When building or improving any CLI tool in this project, follow these principles:

## Output Design
- stdout for data only, stderr for everything else (errors, warnings, progress)
- Support `--json` with a consistent envelope: `{"status": "ok|error", "data": {...}}`
- Output must guide the next action — success shows "Next steps", failure shows "Fix"
- No ANSI escape codes when stdout is not a TTY; respect `NO_COLOR` env var

## Error Handling
- Exit 0 on success, semantic non-zero codes on failure (2=usage, 3=not found, 4=permission, 75=transient)
- Errors include: what went wrong, context, fix command, docs link
- Structured errors in JSON mode: `{"code": "AUTH_EXPIRED", "message": "...", "fix": "...", "transient": false}`

## Interactivity
- Every interactive prompt must have a flag equivalent (`--yes`, `--force`, `--name=value`)
- Never hang waiting for input when stdin is not a TTY
- Progress bars and spinners go to stderr only

## Flags and Arguments
- Prefer flags over positional arguments for clarity
- Configuration precedence: flags > env vars > project config > user config > defaults
- Never accept secrets via flags (use env vars or `--password-file`)

## Composability
- Support `--fields` to limit output columns
- Support `--quiet` for minimal output (IDs only)
- Support `--dry-run` for mutating commands
- Create commands output the created resource identifier

For the full guide, see the `better-cli` skill: SKILL.md
