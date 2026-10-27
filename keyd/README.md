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
  It remaps Caps Lock to `F13`, which GNOME uses for its fullscreen toggle.
- `apple-magic-keyboard.conf` — scoped to both Apple Magic Keyboard IDs:
  Bluetooth `004c:029c` and USB `05ac:029c`. Find the ID for a connected
  keyboard with `sudo keyd.rvaiya monitor` on Ubuntu/Debian packages, or
  `sudo keyd monitor` for an upstream install, or inspect
  `/proc/bus/input/devices`.
  It remaps left/right Cmd into a `command` layer that behaves like Ctrl for
  normal application shortcuts, sends distinct Insert/Delete chords for
  terminal copy/paste/cut (`../alacritty/alacritty.toml` turns those into
  `Copy`/`Paste` actions), and maps Command+Space to Super+Space, used for
  Vicinae in GNOME. Plain Ctrl+C in a terminal still sends `SIGINT`. The same
  Caps Lock → F13 remap and ISO extra-key fix apply.

## Install

Debian 13+ and current Ubuntu releases provide `keyd` in apt:

```sh
sudo apt install keyd
```

The Ubuntu/Debian package names the executable `keyd.rvaiya` to avoid a
name collision; the systemd service is still named `keyd`. Upstream builds
use the executable name `keyd`.

Debian 12 (Bookworm) does not package `keyd`. Build the pinned upstream
release `v2.6.0` (commit `7c0aecb8bfd34dc8642bf4eefd2e59c89e61cec3`) from the
[upstream releases](https://github.com/rvaiya/keyd/releases), not the development branch:

```sh
sudo apt install build-essential git
work=$(mktemp -d)
git clone --depth 1 --branch v2.6.0 https://github.com/rvaiya/keyd.git "$work/keyd"
make -C "$work/keyd"
sudo make -C "$work/keyd" install
rm -rf "$work"
```


The bootstrap performs this source build automatically on apt-based Linux
systems when no `keyd` package is available. The bootstrap then publishes
the configs as root-owned copies under `/etc/keyd/`. It does not symlink
into this checkout, because `keyd` runs as root and a symlink would let
checkout edits change the running configuration. Enable the service and
reload:

```sh
sudo install -d -o root -g root -m 0755 /etc/keyd
sudo install -o root -g root -m 0644 "$HOME/my-setup/keyd/default.conf" /etc/keyd/default.conf
sudo systemctl enable --now keyd
sudo keyd.rvaiya reload  # Ubuntu/Debian package; use `sudo keyd reload` for upstream builds
```

Publication rules for the `keyd-config` step:

- Edits to `keyd/*.conf` in the checkout take effect only after rerunning
  `keyd-config`, which republishes the copies.
- A missing file is created. A legacy symlink that points at this checkout
  is backed up and replaced by a copy. Any other symlink, non-regular file,
  or file not owned by root is preserved and blocks the step until you move
  it aside. Nothing is overwritten silently.
- A file whose contents match the checkout is adopted without a rewrite.
  A copy that my-setup published and that you have not edited is updated.
  A copy you have edited is left alone and blocks the step.
- Replaced or removed files are backed up to `/etc/keyd/.my-setup-backups/<timestamp>/`
  before any change. Each publish records the digests of its managed copies
  in `/etc/keyd/.my-setup-sha256`. That record is what lets later runs tell a
  published copy you have edited from one that is merely out of date.
- If the publish or the reload fails, applied changes are restored from
  the backups and the step reports `failed`.

If a connected Apple Magic Keyboard reports either supported ID
(`004c:029c` over Bluetooth or `05ac:029c` over USB), the step also publishes
`apple-magic-keyboard.conf`. When no such device is present, an unmodified
published copy is removed after backup, and a copy you have edited is kept
with a warning. If `/proc/bus/input/devices` cannot be read, existing
Apple-specific copies are preserved and not removed.

If you do not use an Apple Magic Keyboard, skip the Apple-specific file —
`default.conf` still provides the Caps Lock → F13 remap used by GNOME.
