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

- **tmuxscope, built from its upstream repository (this repo's author's own
  separate tool):**
  [https://github.com/fayez-nazzal/tmuxscope](https://github.com/fayez-nazzal/tmuxscope)

  The installer's **GitHub tools** choice clones it into `~/tools/tmuxscope`,
  builds it from `main`, links `~/.local/bin/tmuxscope`, and keeps it updated
  twice a day (see [`../tools/README.md`](../tools/README.md)). By hand:

  ```sh
  ~/my-setup/tools/sync.sh
  ```

  `tmux/tmux-scopes.conf` includes `my-setup = ~/my-setup` for this repo,
  `repos = ~/repos`, and `tools = ~/tools` for these checkouts. Verify with
  `tmuxscope --version`. It requires tmux ≥ 3.0, zsh, and Bun ≥ 1.2.

  **Linux note:** the `0.2.2` release breaks routing on tmux builds that
  vis-escape control bytes in formatted command output (observed on
  Debian's packaged tmux 3.5a; not on Homebrew's tmux on macOS). The
  symptom is every `cd` failing with `tmuxscope route: tmux list-panes …
  failed: can't find window` and a literal `\037` inside the printed tmux
  target. This is fixed upstream past `0.2.2`; the sync builds `main`, which
  includes the fix.

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

- macOS dark-mode detection uses `defaults` only on Darwin. Linux defaults to the dark palette; macOS follows system dark mode and otherwise uses the light palette. `TMUX_THEME=dark` forces dark on either platform.
- TPM and tmuxscope are guarded. A missing installation does not abort config loading.
- `Ctrl-a |` and `Ctrl-a -` split panes in the current working directory. `Ctrl-a N` creates a named session, and `Ctrl-a s` opens sessionx.
