# i3 setup (Linux/Debian)

This is the Linux counterpart to [`../.aerospace.toml`](../.aerospace.toml).
It keeps AeroSpace's **Option/Alt leader** and the same focus, move, split,
workspace, resize, and reload chords. [`../keyd/`](../keyd/) maps an Apple
Magic Keyboard's Command key to Ctrl for application shortcuts, maps
Command+Space to the rofi launcher, and maps Caps Lock to F13. Therefore
Caps Lock alone toggles fullscreen; there is no `$mod+f` fullscreen chord.
Display output layouts are left to the display manager.

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

Select "i3" from your display manager's session list after checking that
your X11/display setup supports it; the bootstrap does not change sessions.

### The GeistMono Nerd Font

`config`, the `i3status` bar, and `alacritty.toml` all set
`GeistMono Nerd Font Mono`. It isn't in Debian's repos. The bootstrap
installs the latest Nerd Fonts release per-user when the font is missing;
manual installation is also available through
[`getnf`](https://github.com/getnf/getnf) or the
[Nerd Fonts releases](https://github.com/ryanoasis/nerd-fonts/releases)
(`GeistMono.zip`, extracted into `~/.local/share/fonts`, then
`fc-cache -f`).

Caution: the `config` file uses the font only when it is installed; i3 and
Alacritty still start with a fallback font if this optional download fails.

## Machine-specific settings

- **Wallpaper**: add your own image at
  `~/.config/i3/wallpaper/nature.jpg` or change the `feh` path in `config`.
  Startup skips wallpaper setup until that file exists.
- **`assign` window classes**: `config` includes common Linux classes for
  Chrome/Chromium/Firefox, Zed, Cursor, Teams, Obsidian, 1Password, and
  XMind. Confirm a new app with `xprop | grep WM_CLASS` and adjust its
  assignment if needed. macOS-only Safari has a matching workspace label but
  no Linux window class.
- **Keyboard contract**: Option/Alt is the i3 leader, matching the Mac
  AeroSpace file. Command remains the application shortcut key through
  keyd; Command+Space opens rofi, and Caps Lock toggles fullscreen.

## Recommended packages (already used by `config`, optional at the config-load level)

- `rofi` — app launcher (`$mod+d`, also `Mod4+space`).
- `picom` — compositor; see [`../picom/README.md`](../picom/README.md).
- `feh` — wallpaper.
- `xss-lock` + `i3lock` — idle-lock integration (`$mod+Shift+Insert` locks
  directly).
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

On this machine (lightdm handing `i3` straight to `Xsession` as the
session's `STARTUP` program) `~/.profile` is **not** read at all — only a
login shell reads it, and lightdm never starts one for a picked desktop
session. The file that's actually sourced for every graphical login,
regardless of session choice, is `~/.xsessionrc` (via Debian's
`/etc/X11/Xsession.d/40x11-common_xsessionrc`); it's what carries `PATH`
(`$HOME/.local/bin` first, so `bin/alacritty`'s wrapper — see
[`../bin/README.md`](../bin/README.md) — actually gets resolved by rofi
drun and any bare `alacritty`) and `LIBVA_DRIVER_NAME` session-wide. Like
`~/.profile`, `~/.xsessionrc` isn't part of this repo (verify what your
display manager actually sources before assuming `.profile` works — check
a running session process's env, e.g. `cat /proc/<i3-child-pid>/environ |
tr '\0' '\n' | grep ^PATH=`). If a GUI app can't find something on
`PATH`, add it there, not the zsh dotfiles — and log out/in afterward,
since already-running session processes (i3, rofi, anything it spawned)
keep whatever `PATH` they started with.
