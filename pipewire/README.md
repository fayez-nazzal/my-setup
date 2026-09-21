# PipeWire drop-ins

Two `pipewire.conf.d`/`pipewire-pulse.conf.d` snippets for a specific USB
headset (ME6S) and Firefox ESR. Skip this directory entirely if you don't
have the same hardware/browser quirks — nothing else in this repo depends
on it.

## `pipewire.conf.d/60-me6s-voice-isolation.conf`

Runs an [RNNoise](https://github.com/xiph/rnnoise) LADSPA filter on the
ME6S microphone as a virtual PipeWire source (`me6s_voice_isolation`),
toggled by [`../bin/noise-cancel`](../bin/README.md).

Requires:

```sh
sudo apt install pipewire pipewire-audio-client-libraries wireplumber
```

plus the `librnnoise_ladspa.so` LADSPA plugin, which isn't in Debian's
repos — build it from
[werman/noise-suppression-for-voice](https://github.com/werman/noise-suppression-for-voice)
and install it to `~/.local/lib/ladspa/librnnoise_ladspa.so`, or edit the
`plugin =` path in the config to wherever you installed it.

**This file hardcodes an absolute path with a username
(`/home/<username>/.local/lib/ladspa/...`) instead of `$HOME`** — unlike this
repo's shell configs, PipeWire's config format (SPA-JSON) does not expand
environment variables, so the path can't be made portable the usual way.
Edit that one line for your own username/install path before symlinking on
a different machine.

Install:

```sh
mkdir -p "$HOME/.config/pipewire/pipewire.conf.d"
ln -sfn "$HOME/my-setup/pipewire/pipewire.conf.d/60-me6s-voice-isolation.conf" \
  "$HOME/.config/pipewire/pipewire.conf.d/60-me6s-voice-isolation.conf"
systemctl --user restart pipewire wireplumber pipewire-pulse
```

Also rename `alsa_input.usb-ME6S_MS_N-B_R-UN__3db_ME6S-00.mono-fallback`
(the source node it captures from) for your own device — list nodes with
`pw-dump | jq -r '.[] | select(.type=="PipeWire:Interface:Node") |
.info.props["node.name"]'`.

## `pipewire-pulse.conf.d/60-firefox-microphone-routing.conf`

Works around Firefox ESR marking its capture streams as immovable, which
would otherwise stop `noise-cancel`/`audio-control` from moving Firefox's
mic input onto the RNNoise virtual source above.

```sh
mkdir -p "$HOME/.config/pipewire/pipewire-pulse.conf.d"
ln -sfn "$HOME/my-setup/pipewire/pipewire-pulse.conf.d/60-firefox-microphone-routing.conf" \
  "$HOME/.config/pipewire/pipewire-pulse.conf.d/60-firefox-microphone-routing.conf"
systemctl --user restart pipewire-pulse
```

Only relevant if you run `firefox-esr`; harmless (and pointless) otherwise.
