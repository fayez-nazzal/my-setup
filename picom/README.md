# picom (compositor)

`picom.conf` is a low-overhead, hardware-neutral baseline: XRender with
vsync, fullscreen bypass, and visual effects disabled. It avoids
driver-specific workarounds and does not depend on GLX support.

## Install

```sh
sudo apt install picom
mkdir -p "$HOME/.config/picom"
ln -sfn "$HOME/my-setup/picom/picom.conf" "$HOME/.config/picom/picom.conf"
```

`../i3/config` already execs `picom --config ~/.config/picom/picom.conf` on
startup — no separate autostart needed once i3 is using this repo's config.

## Hardware considerations

The default XRender backend works without GLX support. Switch to GLX only
after confirming it works on the target X server; optional effects can be
re-enabled if desired, but the defaults favor low overhead.
