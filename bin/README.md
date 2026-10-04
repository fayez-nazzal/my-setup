# bin/ — user scripts

Small scripts symlinked onto `$PATH` (`~/.local/bin`, already added to
`$PATH` by `zsh/.config/zsh/profile.d/20-path.zsh` and `~/.profile`).

```sh
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/my-setup/bin/alacritty" "$HOME/.local/bin/alacritty"
```

- **`alacritty`** — shadows the real `alacritty` binary so ordinary launches
  use the persistent tmux session `main`. Explicit `-e`/`--command` launches
  pass through to preserve `xdg-terminal-exec` behavior. Other non-window
  subcommands (`--version`, `msg`, `migrate`, `--help`) pass through too.
  Requires `tmux` and `alacritty`.
- **`styleguard`** — provider-agnostic AI-content-detection + personal-style
  CLI: detect-scores a draft against Winston AI, rewrites low-scoring
  sentences with `gpt-6-astra` via the OpenAI Responses API, and enforces a
  deterministic personal style pass (no em/en-dash, contractions expanded,
  no stacked punctuation), looping until a candidate clears both the
  human-likeness threshold and a readability floor, or best-effort
  iterations are exhausted. Cross-platform (see `install_styleguard` in
  `../install.sh`). Requires `bun` and a signed-in `op` CLI with the
  `gowinston` and `OMP OPENAI` 1Password items reachable. See
  [`styleguard/README.md`](styleguard/README.md) for full usage, secret setup,
  and config format.
