# Alacritty

Terminal emulator used by `../i3/config` (`$mod+Return` →
`../bin/alacritty`) and by `../bin/alacritty`'s tmux-backed single-window
launcher, which also shadows the plain `alacritty` command on `$PATH` (see
`../bin/README.md`). Ordinary launches through i3, rofi `drun`, or a bare
`alacritty` typed in a shell stay in the shared tmux session; explicit
`-e`/`--command` launches pass through for terminal commands from GNOME.

## Install

```sh
sudo apt install alacritty
mkdir -p "$HOME/.config/alacritty"
ln -sfn "$HOME/my-setup/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"
```

Requires:

- `/bin/zsh` (hardcoded as `terminal.shell.program`) — adjust if zsh
  lives elsewhere on your system (`command -v zsh`), or if you haven't
  switched to zsh yet (see [`../zsh`](../zsh)).
- The **GeistMono Nerd Font** — see
  [`../i3/README.md#the-geistmono-nerd-font`](../i3/README.md#the-geistmono-nerd-font)
  for install instructions; not required for Alacritty to start, only to
  render the configured font correctly.
- The `Insert`-key bindings assume [`keyd`](../keyd/README.md)'s
  `[command:C]` layer is installed and emitting `Ctrl+Insert`/`Shift+Insert`
  for Cmd+C/Cmd+V — without keyd, those bindings are simply unreachable
  from a physical keyboard (harmless, not an error) and normal
  Ctrl+Shift+C/V still work for copy/paste.
