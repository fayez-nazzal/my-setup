# GNOME companion setup

This is the GNOME counterpart to [`../i3/config`](../i3/config). It keeps the
same Option/Alt workspace habits, Apple Command application shortcuts through
[`../keyd/`](../keyd/), rofi as the Raycast replacement, Alacritty as the
terminal, and Caps Lock as the fullscreen toggle.

## What is configured

`dconf.ini` declares:

- 12 fixed GNOME workspaces, named to match the shared layout:
  `1: Editor`, `2: Browser`, `3: Cursor`, `4: Teams`, `5`–`10`, `G: Terminal`,
  and `P: 1Password`.
- `Alt+1` through `Alt+9`, `Alt+0`, `Alt+G`, and `Alt+P` workspace switching.
- `Alt+Shift` versions of those bindings to move the focused window.
- `Caps Lock` → `F13` through keyd → GNOME fullscreen toggle.
- `Command+Space` → `Super+Space` through keyd → rofi `drun`.
- `Alt+D` → rofi `drun`.
- `Alt+Enter` → the repository's Alacritty wrapper, using its persistent
  tmux `main` session. Because GNOME has no i3 socket, each invocation can
  open a separate Alacritty window. `xdg-terminals.list` also makes
  `Alacritty.desktop` the GNOME default terminal for applications that use
  `xdg-terminal-exec`.
- `Alt+Shift+Insert` → lock screen.
- GeistMono Nerd Font Mono as GNOME's monospace font and Alacritty's terminal
  font through the existing [`../alacritty/alacritty.toml`](../alacritty/alacritty.toml).

GNOME does not provide i3/AeroSpace's native directional container focus,
gaps, scratchpad, or per-window-class assignment rules. Those remain i3-only.
GNOME supports only twelve numbered workspace keybinding slots, so the shared
named layout exposes `G` and `P` as workspaces 11 and 12; the additional
macOS-only `O`, `X`, `S`, `Q`, and `W` workspace names do not have native GNOME
slots.

## Install and sync

The installer creates these symlinks:

```sh
ln -sfn "$HOME/my-setup/gnome/dconf.ini" \
  "$HOME/.config/my-setup/gnome.dconf"
ln -sfn "$HOME/my-setup/gnome/xdg-terminals.list" \
  "$HOME/.config/xdg-terminals.list"
ln -sfn "$HOME/my-setup/gnome/apply.sh" \
  "$HOME/.local/bin/my-setup-gnome"
```

It then runs `my-setup-gnome` when a usable GNOME dconf session is available.
The dconf database is not itself symlinkable; the tracked `dconf.ini` remains
the source of truth. After editing the repository file, apply the change with:

```sh
my-setup-gnome
```

Use `my-setup-gnome dump` only for inspection. Do not copy the complete dump
back into the tracked file: it contains unrelated machine-local GNOME state.

The existing keyd system configuration is also required for the Apple Command
layer and Caps Lock behavior. See [`../keyd/README.md`](../keyd/README.md).
GNOME must be running in the current user session when applying dconf settings.
