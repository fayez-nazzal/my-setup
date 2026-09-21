# bin/ — user scripts

Small scripts symlinked onto `$PATH` (`~/.local/bin`, already added to
`$PATH` by `zsh/.config/zsh/profile.d/20-path.zsh` and `~/.profile`).

```sh
mkdir -p "$HOME/.local/bin"
for f in alacritty audio-control noise-cancel; do
  ln -sfn "$HOME/my-setup/bin/$f" "$HOME/.local/bin/$f"
done
```

- **`alacritty`** — shadows the real `alacritty` binary (this directory is
  ahead of `/usr/bin` on `$PATH` for both the X session and interactive
  shells — see `../i3/README.md#gui-apps-and-the-zsh-environment`), so
  every launch path (`../i3/config`'s `$mod+Return`, rofi `drun`'s
  `Alacritty.desktop`, or just typing `alacritty`) funnels through it.
  Enforces one Alacritty window backed by a persistent tmux session
  (`main`); focuses the existing window via `i3-msg`/`jq` instead of
  spawning a second one. Non-window subcommands (`--version`, `msg`,
  `migrate`, `--help`) pass through to the real binary. Requires `i3`,
  `jq`, `tmux`, `alacritty`.
- **`audio-control`** — volume/mute/gain for a specific USB headset (device
  names hardcoded at the top of the script — rename for your own hardware,
  see [`../pipewire/README.md`](../pipewire/README.md)). Requires
  `pipewire`/`wireplumber` (`wpctl`, `pw-dump`) and `jq`. `zsh/.config/zsh`
  aliases `speaker-up`/`speaker-down`/`speaker-mute`/`speaker-volume`/
  `mic-up`/`mic-down`/`mic-mute`/`mic-volume`/`audio-help` to this script
  when it's on `PATH`.
- **`noise-cancel`** — toggles the RNNoise PipeWire filter chain described
  in [`../pipewire/README.md`](../pipewire/README.md) on/off, and reports
  its status. Requires the same PipeWire tools plus `pactl`. Aliased as
  `ncon`/`ncoff`/`ncstatus`.

All three are guarded with `command -v` in the zsh aliases that reference
them, so a machine without the matching hardware/PipeWire setup just
doesn't get the aliases — nothing breaks.
