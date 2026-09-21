# tmux setup

The repository-root `.tmux.conf` is the portable tmux configuration. Install it with:

```sh
ln -sfn "$HOME/my-setup/.tmux.conf" "$HOME/.tmux.conf"
```

Back up an existing `~/.tmux.conf` before creating the link.

## Required

- tmux. This configuration was smoke-tested with tmux 3.7c. Older versions may not support every option used here, including popup and extended-key features.
- [TPM](https://github.com/tmux-plugins/tpm), installed at `~/.tmux/plugins/tpm`:

  ```sh
  git clone https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"
  ```

- The plugins declared in `.tmux.conf`:
  - [tmux-sensible](https://github.com/tmux-plugins/tmux-sensible)
  - [tmux-sessionx](https://github.com/omerxx/tmux-sessionx)
  - [tmux-logging](https://github.com/tmux-plugins/tmux-logging)
  - [tmux-ukiyo](https://github.com/Nybkox/tmux-ukiyo)

  Start tmux, reload the configuration (`tmux source-file ~/.tmux.conf` or
  `Ctrl-a` then `:source-file ~/.tmux.conf`), then press `Ctrl-a I` to
  install TPM plugins interactively — or run TPM's installer directly for a
  scripted setup: `~/.tmux/plugins/tpm/bin/install_plugins`. The
  configuration starts without TPM or plugin directories, so first
  installation is safe; `Ctrl-a U` updates plugins later.

- **tmuxscope, built from its upstream repository:**
  [https://github.com/REDACTED-REDACTED/tmuxscope](https://github.com/REDACTED-REDACTED/tmuxscope)

  There's no published package — clone and build it with Bun. The default
  `tmux/tmux-scopes.conf` ships with a single `repos = ~/repos` scope, which
  already covers `~/repos/tools/tmuxscope` as a subdirectory, so no extra
  scope entry is needed just to build it here:

  ```sh
  mkdir -p "$HOME/repos/tools"
  git clone https://github.com/REDACTED-REDACTED/tmuxscope.git "$HOME/repos/tools/tmuxscope"
  cd "$HOME/repos/tools/tmuxscope"
  bun install
  bun run build
  bun link
  ```

  `bun link` (run inside the cloned repo) registers the package globally and
  symlinks its compiled binary onto `bun`'s global bin dir
  (`~/.bun/bin/tmuxscope`, already on `PATH` via `zsh/.config/zsh/rc.d/`) —
  no separate install step needed. Verify with `tmuxscope --version`
  (tested against 0.2.2, matching `package.json` at clone time). Requires
  tmux ≥ 3.0, zsh, and Bun ≥ 1.2 (all satisfied by this repo's zsh setup).

  **Linux note:** the `0.2.2` release breaks routing on tmux builds that
  vis-escape control bytes in formatted command output (observed on
  Debian's packaged tmux 3.5a; not on Homebrew's tmux on macOS). The
  symptom is every `cd` failing with `tmuxscope route: tmux list-panes …
  failed: can't find window` and a literal `\037` inside the printed tmux
  target. This is fixed upstream past `0.2.2` (the `FIELD` separator moved
  off the byte tmux rewrites) — after cloning, check out `main` rather than
  the `0.2.2` tag, or apply that fix on top, before `bun run build`.

  The scope definitions are tracked in `tmux/tmux-scopes.conf`; install
  them with:

  ```sh
  mkdir -p "$HOME/.config"
  ln -sfn "$HOME/my-setup/tmux/tmux-scopes.conf" "$HOME/.config/tmux-scopes.conf"
  ```

  The file uses `~`-relative paths, so it does not contain this machine's
  username, but the *directories themselves* are still one person's actual
  project layout — **adjust the scope patterns for projects on a new
  machine** (some may simply not exist yet there, which is harmless:
  `tmuxscope doctor` reports a `missing directory` note for an absent scope
  pattern but changes nothing). Create the file from the upstream
  `tmux-scopes.conf.example` if the repository layout differs. The tmux
  integration is loaded with `tmuxscope hook tmux`; the zsh integration is
  loaded separately by `zsh/.config/zsh/rc.d/40-hooks.zsh`
  (`eval "$(tmuxscope hook zsh)"`, already guarded by `command -v
  tmuxscope`).

## Optional conveniences

These are not part of this repository yet, but the config uses them when present:

- `$HOME/.local/bin/tmux-claude-badge`, used for live pane labels. The existing script is macOS-oriented; do not install it on Linux without porting its theme and file-stat commands.
- `$HOME/.local/bin/histago-popup`, bound to `Ctrl-a H`. It requires `zsh`, `histago`, and `fzf`. The binding is omitted automatically when the helper is not executable.

Without either helper, all core bindings and plugin behavior remain available.

## Portability notes

- No username, Homebrew path, or macOS-only command is required for baseline startup.
- macOS dark-mode detection uses `defaults` only on Darwin. Other systems use the light palette by default; set `TMUX_THEME=dark` before starting tmux to select the dark palette.
- TPM and tmuxscope are guarded. A missing installation does not abort config loading.
- `Ctrl-a |` and `Ctrl-a -` split panes in the current working directory. `Ctrl-a N` creates a named session, and `Ctrl-a s` opens sessionx.
