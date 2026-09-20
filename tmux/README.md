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

  Start tmux, reload the configuration, then press `Ctrl-a I` to install TPM plugins. The configuration starts without TPM or plugin directories, so first installation is safe.

- **tmuxscope, installed from its upstream repository:**
  [https://github.com/REDACTED-REDACTED/tmuxscope](https://github.com/REDACTED-REDACTED/tmuxscope)

  The current setup uses tmuxscope 0.2.2, installed through Bun, and expects the `tmuxscope` executable on `PATH`. The scope definitions are tracked in `tmux/tmux-scopes.conf`; install them with:

  ```sh
  mkdir -p "$HOME/.config"
  ln -sfn "$HOME/my-setup/tmux/tmux-scopes.conf" "$HOME/.config/tmux-scopes.conf"
  ```

  The file uses `~`-relative paths, so it does not contain this machine's username. Adjust the scope patterns for projects on a new machine. Create the file from the upstream `tmux-scopes.conf.example` if the repository layout differs. The tmux integration is loaded with `tmuxscope hook tmux`; the zsh integration is loaded separately by the setup's zsh hook.

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
