# bin/ — user scripts

Small scripts symlinked onto `$PATH` (`~/.local/bin`, already added to
`$PATH` by `zsh/.config/zsh/profile.d/20-path.zsh` and `~/.profile`).

```sh
mkdir -p "$HOME/.local/bin"
ln -sfn "$HOME/my-setup/bin/aerospace-alacritty" "$HOME/.local/bin/aerospace-alacritty"
```

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
  configuration link in `install.sh`. Requires `bun` and a signed-in `op` CLI with the
  `gowinston` and `OMP OPENAI` 1Password items reachable. See
  [`styleguard/README.md`](styleguard/README.md) for full usage, secret setup,
  and config format.
