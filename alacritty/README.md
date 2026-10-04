# Alacritty

Every Alacritty window opens in the shared tmux session `main`, however it is
launched: Dock, Spotlight, `open -a Alacritty`, AeroSpace's Alt+Enter, GNOME's
shortcut or `xdg-terminal-exec`, or `alacritty` from a shell. This lives in
`terminal.shell` in [`alacritty.toml`](alacritty.toml), so no `$PATH` wrapper is
involved. `alacritty -e CMD` replaces that shell and runs `CMD` without tmux.

The shell runs a login zsh first, so the tmux server inherits the full login
environment, then attaches with `tmux new-session -A -s main`. tmux is looked
up on that `$PATH`, then in `/opt/homebrew/bin`, `/usr/local/bin`,
`/home/linuxbrew/.linuxbrew/bin`, and `/usr/bin`. `TMUX` is cleared first, so
a window opened from inside a tmux pane attaches instead of refusing to nest.
Without tmux the window prints a notice and starts a plain login zsh.

Detaching (`prefix d`) or ending the session closes the window. A window
attaches session `main` while it exists and creates it otherwise; tmuxscope's
hook (see [`../tmux`](../tmux)) renames sessions after their directory scope,
so a later window usually starts a fresh `main`. Switch sessions inside tmux
(`prefix s`).

## Install

Select **Alacritty configuration** in `./install.sh`. It links
`alacritty.toml` into `~/.config/alacritty/` and removes the
`~/.local/bin/alacritty` wrapper link earlier versions of this repository
created (only while it still points at this repository). Alacritty reloads the
file automatically; already-open windows keep their shell, so open a new
window to get tmux.

By hand:

```sh
mkdir -p "$HOME/.config/alacritty"
ln -sfn "$HOME/my-setup/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"
```

Requires:

- **Alacritty 0.14 or newer.** Older releases read the shell from the
  top-level `shell` key and ignore `terminal.shell`, so their windows open a
  plain shell. The installer flags such a version (for example Ubuntu 24.04's
  APT package, 0.13.2).
- **tmux** — the `tmux` installer choice.
- `/bin/zsh` (hardcoded as `terminal.shell.program`) — adjust if zsh
  lives elsewhere on your system (`command -v zsh`), or if you haven't
  switched to zsh yet (see [`../zsh`](../zsh)).
- The **GeistMono Nerd Font Mono** family — select `Geist Mono Nerd Font` in
  the interactive installer to install its Regular, Bold, and Italic faces.
  On macOS the installer also checks that the font service has activated
  them and registers them for your user when it hasn't (a `~/Library/Fonts`
  created after login is not picked up on its own). Without the font,
  Alacritty still starts but warns `Unable to load specified font … falling
  back to Menlo`; open a new Alacritty window after the installer runs.
- The `Insert`-key bindings assume [`keyd`](../keyd/README.md)'s
  `[command:C]` layer is installed and emitting `Ctrl+Insert`/`Shift+Insert`
  for Cmd+C/Cmd+V — without keyd, those bindings are simply unreachable
  from a physical keyboard (harmless, not an error) and normal
  Ctrl+Shift+C/V still work for copy/paste.
