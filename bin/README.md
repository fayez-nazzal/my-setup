# bin/ — user scripts

Small scripts symlinked onto `$PATH` (`~/.local/bin`, already added to
`$PATH` by `zsh/.config/zsh/profile.d/20-path.zsh` and `~/.profile`).

```sh
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/my-setup/bin/aerospace-alacritty" "$HOME/.local/bin/aerospace-alacritty"
```

- **`omp-setup-credentials`** — one-time macOS OMP token creation/recovery.
  Run `zsh ~/my-setup/bin/omp-setup-credentials` in your terminal. Signs into
  1Password, creates a read-only OMP service account, checks all five vault
  references, and replaces the Keychain token with an encrypted backup of
  the old value. Resets trusted applications to restore launch-time prompts.
  Secrets are never printed or passed in argv. See
  [`OMP credentials`](../zsh/README.md#omp-credentials).
- **`claude-excalidraw-header`** — Claude Code `headersHelper` for the Excalidraw
  MCP server. Prints the Authorization header as JSON from
  `MY_SETUP_CLAUDE_EXCALIDRAW_KEY`, which the `claude` launcher
  (`zsh/.config/zsh/rc.d/71-claude.zsh`) sets once at session start. It never
  reads the credential store or `op`. Link it by hand:
  `ln -sfn "$HOME/my-setup/bin/claude-excalidraw-header" "$HOME/.local/bin/claude-excalidraw-header"`.
- **`aerospace-alacritty`** — macOS AeroSpace Alt+Enter helper: focuses an
  existing Alacritty window, otherwise opens Alacritty (`open -b org.alacritty`),
  whose configuration starts the tmux session (see
  [`../alacritty/README.md`](../alacritty/README.md)).

- **`my-setup-alacritty-shell`** — default Alacritty shell entrypoint. Link it
  to `~/.local/bin/my-setup-alacritty-shell`; Alacritty's configured login
  shell sources it to serialize default tmux launches and reuse the marked
  default session (see [`../alacritty/README.md`](../alacritty/README.md)).
- **`styleguard`** — provider-agnostic AI-content-detection + personal-style
  CLI: detect-scores a draft against Winston AI, rewrites low-scoring
  sentences with `gpt-6-astra` via the OpenAI Responses API, and enforces a
  deterministic personal style pass (no em/en-dash, contractions expanded,
  no stacked punctuation), looping until a candidate clears both the
  human-likeness threshold and a readability floor, or best-effort
  iterations are exhausted. Cross-platform; select the `styleguard`
  configuration link in `install.sh`. Requires `bun` and a personal-account signed-in `op` CLI with the
  `gowinston` (Personal) and `OMP OPENAI` (OMP vault) 1Password items reachable. See
  [`styleguard/README.md`](styleguard/README.md) for full usage, secret setup,
  and config format.
