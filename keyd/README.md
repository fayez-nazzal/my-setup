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

```sh
sudo apt install keyd
sudo mkdir -p /etc/keyd
sudo ln -sfn "$HOME/my-setup/keyd/default.conf" /etc/keyd/default.conf
sudo ln -sfn "$HOME/my-setup/keyd/apple-magic-keyboard.conf" /etc/keyd/apple-magic-keyboard.conf
sudo systemctl enable --now keyd
sudo keyd reload   # after any future edit to either file
```

If you don't use an Apple Magic Keyboard, skip that file entirely (or find
your own keyboard's `vendor:product` id and adapt it) — `default.conf`
alone still gives you the Caps Lock → F13 remap that `../i3/config` expects.
