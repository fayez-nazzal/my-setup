# picom (compositor)

Eliminates tearing on scroll/hover/animation under i3 (which has no
compositor of its own). `picom.conf` is tuned specifically for an old Intel
HD Graphics 3000 iGPU (`glx-no-stencil`/`glx-no-rebind-pixmap` work around
crocus-driver stutter) and disables every visual effect (shadows, fading,
blur) to keep overhead near zero — it's a performance config, not an
eye-candy one.

## Install

```sh
sudo apt install picom
mkdir -p "$HOME/.config/picom"
ln -sfn "$HOME/my-setup/picom/picom.conf" "$HOME/.config/picom/picom.conf"
```

`../i3/config` already execs `picom --config ~/.config/picom/picom.conf` on
startup — no separate autostart needed once i3 is using this repo's config.

## Adjusting for different hardware

On a newer GPU (Intel Xe/UHD, AMD, or discrete), drop the two `glx-no-*`
workarounds and consider re-enabling `shadow`/`fading`/`blur-method` if you
want the eye-candy this config deliberately trades away for lower latency
on old hardware.
