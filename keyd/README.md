# keyd (Linux Mac-keyboard remap)

[`keyd`](https://github.com/rvaiya/keyd) is a system-wide key remapping
daemon — the Linux/Debian way to get the AeroSpace-on-a-Mac-keyboard
ergonomics (Cmd-style shortcuts, Caps Lock as a spare key) without a
per-application remap.

**Its config lives in `/etc/keyd/`, not `~/.config/`** — `keyd` is a
root-run system service and only reads `/etc/keyd/*.conf`. (If you find a
stray `~/.config/keyd/` on a machine, it's not read by anything; delete it
to avoid confusion.)

- `default.conf` — every keyboard *except* the Apple Magic Keyboard.
  It remaps Caps Lock to `F13` (bound to `fullscreen toggle` in
  `../i3/config`) so Caps Lock stops being a lock key.
- `apple-magic-keyboard.conf` — scoped to both Apple Magic Keyboard IDs:
  Bluetooth `004c:029c` and USB `05ac:029c`. Find the ID for a connected
  keyboard with `sudo keyd.rvaiya monitor` on Ubuntu/Debian packages, or
  `sudo keyd monitor` for an upstream install, or inspect
  `/proc/bus/input/devices`.
  It remaps left/right Cmd into a `command` layer that behaves like Ctrl for
  normal application shortcuts, sends distinct Insert/Delete chords for
  terminal copy/paste/cut (`../alacritty/alacritty.toml` turns those into
  `Copy`/`Paste` actions), and maps Command+Space to Super+Space, used for
  rofi in i3 and Vicinae in GNOME. Plain Ctrl+C in a terminal still sends
  `SIGINT`. The same Caps Lock → F13 remap and ISO extra-key fix apply.

## Install

Debian 13+ and current Ubuntu releases provide `keyd` in apt:

```sh
sudo apt install keyd
```

The Ubuntu/Debian package names the executable `keyd.rvaiya` to avoid a
name collision; the systemd service is still named `keyd`. Upstream builds
use the executable name `keyd`.

Debian 12 (Bookworm) does not package `keyd`. Build a tagged stable release
from the [upstream releases](https://github.com/rvaiya/keyd/releases), not
the development branch:

```sh
sudo apt install build-essential git
work=$(mktemp -d)
git clone --depth 1 --branch v2.6.0 https://github.com/rvaiya/keyd.git "$work/keyd"
make -C "$work/keyd"
sudo make -C "$work/keyd" install
rm -rf "$work"
```


The bootstrap performs this source build automatically on apt-based Linux
systems when no `keyd` package is available. Then symlink the required
default config and enable the service:

```sh
sudo mkdir -p /etc/keyd
sudo ln -sfn "$HOME/my-setup/keyd/default.conf" /etc/keyd/default.conf
sudo systemctl enable --now keyd
sudo keyd.rvaiya reload  # Ubuntu/Debian package; use `sudo keyd reload` for upstream builds
```

Back up any existing files in `/etc/keyd/` before creating these symlinks.
If a connected Apple Magic Keyboard reports either supported ID
(`004c:029c` over Bluetooth or `05ac:029c` over USB), also add:

```sh
sudo ln -sfn "$HOME/my-setup/keyd/apple-magic-keyboard.conf" /etc/keyd/apple-magic-keyboard.conf
```

If you do not use an Apple Magic Keyboard, skip the Apple-specific file —
`default.conf` alone still gives every other keyboard the Caps Lock → F13
remap that `../i3/config` expects.
