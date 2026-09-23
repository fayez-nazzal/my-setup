# keyd (Linux Mac-keyboard remap)

[`keyd`](https://github.com/rvaiya/keyd) is a system-wide key remapping
daemon — the Linux/Debian way to get the AeroSpace-on-a-Mac-keyboard
ergonomics (Cmd-style shortcuts, Caps Lock as a spare key) without a
per-application remap.

**Its config lives in `/etc/keyd/`, not `~/.config/`** — `keyd` is a
root-run system service and only reads `/etc/keyd/*.conf`. (If you find a
stray `~/.config/keyd/` on a machine, it's not read by anything; delete it
to avoid confusion.)

Two files, split by device:

- `default.conf` — every keyboard *except* the Apple Magic Keyboard.
  Currently just remaps Caps Lock to `F13` (bound to `fullscreen toggle` in
  `../i3/config`) so Caps Lock stops being a lock key.
- `apple-magic-keyboard.conf` — scoped to `[ids] 05ac:029c` (the exact
  USB/Bluetooth vendor:product ID of an Apple Magic Keyboard; find yours
  with `sudo libinput list-devices` or `cat /proc/bus/input/devices`).
  Remaps left/right Cmd into a `command` layer that emits Ctrl-based
  Insert/Delete chords for copy/paste/cut (`../alacritty/alacritty.toml`
  turns those into `Copy`/`Paste` actions — plain `Ctrl+C` in a terminal
  still sends `SIGINT`), plus the same Caps Lock → F13 remap and an ISO
  extra-key fix.

## Install

Debian 13+ provides `keyd` in apt:

```sh
sudo apt install keyd
```

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
sudo keyd reload   # after any future edit to the file
```

Back up any existing files in `/etc/keyd/` before creating these symlinks.
Only if you use an Apple Magic Keyboard with vendor:product ID `05ac:029c`,
also add:

```sh
sudo ln -sfn "$HOME/my-setup/keyd/apple-magic-keyboard.conf" /etc/keyd/apple-magic-keyboard.conf
```

If you don't use that exact keyboard, skip the Apple-specific file —
`default.conf` alone still gives you the Caps Lock → F13 remap that
`../i3/config` expects.
