# i3 setup (Linux/Debian)

This is the actual, in-daily-use i3 config for this machine — the Linux
counterpart to [`../.aerospace.toml`](../.aerospace.toml). It shares
AeroSpace's Alt-based modifier and the "feels like a Mac" ergonomics via
[`../keyd/`](../keyd/README.md) (Cmd-style Insert/Delete chords, Caps Lock →
F13 → fullscreen). It is a specific person's config, not a generic
template — machine-specific bits (monitor names, wallpaper, `assign` window
classes, app launch shortcuts) are called out below and inline in `config`,
same as `.aerospace.toml` does for its own bundle IDs and helper scripts.

No Homebrew involved — everything below is `apt`, a `.deb`, or a plain
binary/script.

## Install

```sh
sudo apt install i3 i3-wm i3lock i3status python3 dex feh picom rofi \
  xss-lock network-manager network-manager-gnome pulseaudio-utils

mkdir -p "$HOME/.config/i3" "$HOME/.config/i3status"
ln -sfn "$HOME/my-setup/i3/config" "$HOME/.config/i3/config"
ln -sfn "$HOME/my-setup/i3/i3status/status.py" "$HOME/.config/i3status/status.py"
```

Then also set up, in order: [`keyd`](../keyd/README.md) (system-wide, needs
`sudo`), [`picom`](../picom/README.md), [`alacritty`](../alacritty/README.md),
and the [`bin/`](../bin/README.md) helper scripts — `config` references all
of them. Back up any existing `~/.config/i3/config` first, and drop your own
wallpaper at `~/.config/i3/wallpaper/` (not tracked here; `config`'s `feh`
line expects `nature.jpg` — point it at your own file).

Select "i3" as the session in your display manager's login screen (this
machine uses `lightdm`), replacing AeroSpace's `start-at-login`.

### The GeistMono Nerd Font

`config`, the `i3status` bar, and `alacritty.toml` all set
`GeistMono Nerd Font Mono`. It isn't in Debian's repos — install via
[`getnf`](https://github.com/getnf/getnf) or manually from the
[Nerd Fonts releases](https://github.com/ryanoasis/nerd-fonts/releases)
(`GeistMono.zip`, extracted into `~/.local/share/fonts`, then
`fc-cache -f`).

## Required one-time edits

- **Monitor output names** (`config`'s `exec ... xrandr --output HDMI-1 ...
  --output LVDS-1 --off` line): find yours with `xrandr --query` and
  replace `HDMI-1`/`LVDS-1`. Single-monitor machines can drop the whole
  `exec` line.
- **`assign` window classes** (`Alacritty`, `Helium`, `dev.zed.Zed`,
  `obsidian`, `com.onepassword.OnePassword`): confirm with `xprop | grep
  WM_CLASS` (click the target window) and adjust for what you actually run.
  `Helium` here is this machine's default browser (see
  `~/.config/mimeapps.list`); swap in `Chrome`/`Chromium`/whatever you use.

## Recommended packages (already used by `config`, optional at the config-load level)

- `rofi` — app launcher (`$mod+d`, also `Mod4+space`).
- `picom` — compositor; see [`../picom/README.md`](../picom/README.md).
- `feh` — wallpaper.
- `xss-lock` + `i3lock` — idle-lock integration ($mod+Shift+x locks directly).
- `network-manager-gnome` — provides `nm-applet` for the tray icon (`config`
  execs it unconditionally; harmless if absent, just no tray icon — there's
  no systray `bar` block here to dock it in anyway).
- `pulseaudio-utils` (`pactl`) — volume/mic-mute media keys.

## Known gaps vs. AeroSpace

Same two structural differences documented for a generic i3 setup apply
here too:

- **Mouse follows focus**: AeroSpace warps the mouse on focus/monitor
  change; i3 has no built-in equivalent, and this config doesn't set
  `focus_follows_mouse` (i3 default `yes` — click-to-focus AeroSpace users
  may want `focus_follows_mouse no` instead; not currently set here).
- **Auto-reload-config**: AeroSpace watches its config file; here it's
  `Mod1+Shift+c` (reload) and `Mod1+Shift+r` (restart in place).

## GUI apps and the zsh environment

`i3 exec` and `rofi`-launched processes inherit the X session's
environment, not your interactive zsh shell's — `PATH`/`VOLTA_HOME`/etc.
set in `zsh/.zshenv` or `zsh/.config/zsh/rc.d/*` are invisible to them.
This machine's `~/.profile` (not part of this repo — it's a stock Debian
file, read by the display manager's `Xsession` regardless of login shell)
carries the subset of env needed session-wide (`PATH`, `VOLTA_HOME`,
`LIBVA_DRIVER_NAME`). If a GUI app can't find something on `PATH`, that's
where to add it, not the zsh dotfiles.
