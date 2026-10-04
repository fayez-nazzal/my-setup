# Alacritty

Terminal emulator used by `../bin/alacritty`'s tmux-backed launcher, which
also shadows the plain `alacritty` command on `$PATH` (see
[`../bin/README.md`](../bin/README.md)). Ordinary launches use the shared
tmux session; explicit `-e`/`--command` launches pass through for terminal
commands from GNOME.

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
