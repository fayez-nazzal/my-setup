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
  Uses persistent tmux session `main`; under i3, focuses an existing
  Alacritty window via `i3-msg`/`jq` instead of spawning another. Outside
  i3, or when no i3 socket is available, launches normally. Non-window
  subcommands (`--version`, `msg`, `migrate`, `--help`) pass through to the
  real binary. Requires `tmux`, `alacritty`; `i3-msg` and `jq` are optional
  and only enable the i3 focus behavior.
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
- **`styleguard`** — provider-agnostic AI-content-detection + personal-style
  CLI: detect-scores a draft against Winston AI, rewrites low-scoring
  sentences with `gpt-6-astra` via the OpenAI Responses API, and enforces a
  deterministic personal style pass (no em/en-dash, contractions expanded,
  no stacked punctuation), looping until a candidate clears both the
  human-likeness threshold and a readability floor, or best-effort
  iterations are exhausted. Cross-platform (see `install_styleguard` in
  `../install.sh`, not the Linux-only desktop loop). Requires `bun` and a
  signed-in `op` CLI with the `gowinston` and `OMP OPENAI` 1Password items
  reachable. See [`styleguard/README.md`](styleguard/README.md) for full
  usage, secret setup, and config format.

The `alacritty`/`audio-control`/`noise-cancel` trio above is guarded with
`command -v` in the zsh aliases that reference them, so a machine without
the matching hardware/PipeWire setup just doesn't get the aliases — nothing
breaks.
