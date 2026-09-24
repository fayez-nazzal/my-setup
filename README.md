# my-setup

Personal dotfiles for zsh, tmux, a tiling window manager, git, and
[Oh My Pi](https://github.com) (`omp`) agent configuration — cross-platform
between macOS (AeroSpace) and Linux/Debian (i3 + keyd + picom + Alacritty +
PipeWire). Everything is designed to be symlinked from `$HOME` (or, for
`keyd`, from `/etc/keyd/`) and to degrade gracefully when an optional tool
isn't installed — a missing binary is skipped, not a fatal error.

The Linux side is this setup's real desktop config, but its core defaults
are portable — host-specific app classes, wallpaper paths, and headset
device names are called out inline and in each directory's README rather
than hidden or faked.

Linux setups here assume `apt` (Debian/Ubuntu) and never require Homebrew —
even on macOS, only zsh/tmux/git are ever assumed; everything else is
optional and checked with `command -v` before use.

## Layout

```
.
├── AGENTS.md            Index for an AI agent asked to install this repo
├── install.sh           Idempotent bootstrap: detects OS, symlinks + installs
├── .aerospace.toml      AeroSpace tiling window manager config (macOS)
├── i3/
│   ├── config            i3 config (Linux/Debian)
│   ├── i3status/status.py  Custom Python i3bar status line
│   └── README.md          Install, required edits, package list
├── keyd/                 System-wide (/etc/keyd/) Mac-keyboard remap
├── picom/                Compositor config, tuned for old Intel iGPUs
├── alacritty/            Terminal emulator config
├── pipewire/             Headset RNNoise filter + Firefox mic routing
├── bin/                  Scripts symlinked onto $PATH (~/.local/bin)
├── raycast/              Raycast Script Command for AeroSpace pause/resume
├── .tmux.conf           Portable tmux config (see tmux/README.md for setup)
├── tmux/
│   ├── README.md        tmux-specific install/plugin instructions
│   └── tmux-scopes.conf   tmuxscope project scope definitions
├── git/
│   ├── .gitconfig        Portable git defaults (no identity/secrets)
│   └── README.md         ~/.gitconfig.local pattern, GPG signing, credential storage
├── zsh/
│   ├── .zshenv          Always-sourced: Volta, cargo env
│   ├── .zprofile        Login shell: loads profile.d/*
│   ├── .zshrc           Interactive shell: loads rc.d/*
│   ├── .gitignore       Keeps machine-local zsh files out of git
│   └── .config/zsh/
│       ├── lib/load.zsh    zrc_source / zrc_load_dir helpers (dedup + load *.zsh in order)
│       ├── profile.d/      Login-time setup (Homebrew shellenv on macOS, PATH, OrbStack)
│       └── rc.d/           Interactive setup (GPG tty, history, prompt, tool init, aliases, keybindings, completion)
└── .omp/agent/
    ├── config.yml       Oh My Pi UI/theme/model-role settings
    ├── models.yml       Custom model provider definitions (reads secrets via 1Password CLI)
    ├── mcp.json         MCP server config (currently empty; see bin/styleguard/)
    ├── extensions/      Native OMP extensions
    └── skills/          Custom omp skills
```

## Requirements

Core, both platforms:

- [zsh](https://www.zsh.org/) (ships with macOS; `sudo apt install zsh` on Debian)
- git

macOS only:

- [Homebrew](https://brew.sh/) — used for AeroSpace, `zsh-abbr`, and
  optional CLI tools. Not used, and not required, on Linux.

Linux/Debian: no package manager requirement beyond `apt` — every
integration below installs from `apt`, a `.deb`, or a plain binary/script.
Full package list for the Linux desktop stack:

```sh
sudo apt install i3 i3-wm i3lock i3status python3 dex feh picom rofi \
  xss-lock network-manager network-manager-gnome pulseaudio-utils \
  alacritty pipewire pipewire-audio-client-libraries wireplumber \
  zsh git jq tmux fd-find thefuck
```

On Debian 13+, `keyd` is available with `sudo apt install keyd`; Debian 12
must build the latest stable release from upstream (see
[`keyd/README.md`](keyd/README.md)). The bootstrap installs its build
prerequisites and builds it automatically when apt has no `keyd` package.
(`keyd` needs `sudo systemctl enable --now keyd` after install.)
RNNoise noise cancellation needs a LADSPA plugin not in Debian's repos — see
[`pipewire/README.md`](pipewire/README.md); skip it if you don't have the
same USB headset.

Everything else referenced below is optional — each integration checks
`command -v` before doing anything, so an uninstalled tool is silently
skipped.

## Setup

Clone the repo, then either run the bootstrap script or symlink the
pieces you want by hand.

```sh
git clone git@github.com:fayez-nazzal/my-setup.git "$HOME/my-setup"
"$HOME/my-setup/install.sh"
```

`install.sh` is idempotent (safe to re-run), detects your OS, symlinks
every piece below, backs up any pre-existing real file/directory it
would otherwise replace, and installs what it safely can (packages,
plugins, recommended CLI tools). It deliberately does **not** invent a
personal identity, hardware ID, or secret, and does **not** apply one
machine's hardware-specific values (monitor names, window classes,
device IDs) to another — it prints exactly what still needs your input
in a "needs your attention" summary at the end. An AI coding agent
asked to set this repo up should read [`AGENTS.md`](AGENTS.md) first.

The sections below explain what each piece does and how to do it by
hand instead, if you'd rather not run the script (or need to adjust one
piece without touching the rest).

### zsh

```sh
ln -sfn "$HOME/my-setup/zsh/.zshenv"   "$HOME/.zshenv"
ln -sfn "$HOME/my-setup/zsh/.zprofile" "$HOME/.zprofile"
ln -sfn "$HOME/my-setup/zsh/.zshrc"    "$HOME/.zshrc"
mkdir -p "$HOME/.config"
ln -sfn "$HOME/my-setup/zsh/.config/zsh" "$HOME/.config/zsh"
```

Back up any existing `~/.zshenv`, `~/.zprofile`, `~/.zshrc`, or
`~/.config/zsh` first.

The bootstrap links zsh but does not change your account's login shell.
On Linux, run `chsh -s "$(command -v zsh)"` and start a new login session
if you want zsh as the default; the installer reports when it differs.

Load order: `.zshenv` (every shell) → `.zprofile` (login shells, sources
`profile.d/*.zsh` in filename order) → `.zshrc` (interactive shells, sources
`rc.d/*.zsh` in filename order). `zrc_load_dir` (in `lib/load.zsh`) dedupes
sourced files, so re-sourcing is safe.

`profile.d/` sets up Homebrew's shellenv when present (no-ops on Linux or
any macOS machine without Homebrew), dedupes `$PATH`, and sources
OrbStack's shell init when present (macOS-only Docker Desktop alternative;
harmless no-op elsewhere).

`rc.d/` initializes the interactive environment, in order: `GPG_TTY`/agent
tty registration (fixes the classic `Inappropriate ioctl for device` /
pinentry-hang errors, especially inside tmux on Linux — see
[`git/README.md`](git/README.md#gpg-signing-errors)), prompt (`starship`),
`thefuck`, `fzf` (+ `fd`-backed completion, `fzf-git.sh` if cloned to
`~/fzf-git.sh`, bun completions), `bat`/`eza` aliases for `cat`/`ls`,
`zsh-abbr` (Homebrew formula on macOS, manual clone on Linux — see below),
tool `PATH`/env entries (Volta/pnpm/bun/opencode/grok/jbang, with pnpm's
data dir resolved per-OS), `wt`/`nag`/`tmuxscope` shell hooks, a real
persistent history (`HISTFILE`, dedup/share/append options), `gl` git-log
alias, `ffn`/`ffc` find helpers, `omp`/power/audio-helper aliases (each
guarded to the tool that backs it), a `histago`+`fzf` `Ctrl-R` history
search, zsh completion (`compinit -C`), and `zoxide` (aliases `cd` to `z`
when present).

Machine-local overrides that shouldn't be tracked go in
`~/.config/zsh/local.zsh` (auto-sourced last, git-ignored by
`zsh/.gitignore` along with `*.local.zsh` and `.env*`). **Secrets
especially belong there, never in a tracked rc.d file** — see the note in
Notes below.

Recommended tools for the full experience: `starship`, `thefuck`, `fzf`,
`fd`, `bat`, `eza`, `zoxide`, `zsh-abbr`, [`histago`](https://github.com),
[`tmuxscope`](https://github.com/fayez-nazzal/tmuxscope), `wt`, `nag`,
Volta, pnpm. On Debian, most of these are `sudo apt install <name>` (`fd`
is `fd-find`, `bat` may install as `batcat` — Debian's package renames it
to avoid a clash with an unrelated `bat` package, and installing it that
way means the `command -v bat` guard in `00-tools.zsh` won't fire unless
you also `ln -sfn "$(command -v batcat)" ~/.local/bin/bat`).

No `sudo`/no Homebrew alternative, all installing to `~/.local/bin`
(already on `$PATH`) with no root needed — this is what's actually
installed and verified working on this machine:

```sh
# starship, zoxide: official installers, pointed at a user-writable bin dir.
curl -sS https://starship.rs/install.sh | sh -s -- -y -b "$HOME/.local/bin"
curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh

# Volta: always user-local by design, no flag needed.
curl -sS https://get.volta.sh | bash

# fzf: official git-based installer, --bin skips the (also user-local, but
# opt-in) shell-integration lines this repo's rc.d already provides.
git clone --depth 1 https://github.com/junegunn/fzf.git "$HOME/.fzf"
"$HOME/.fzf/install" --bin --no-update-rc
ln -sfn "$HOME/.fzf/bin/fzf" "$HOME/.local/bin/fzf"

# bat, eza: no official curl installer; fetch the upstream release binary.
# Replace the version/arch below with the current release for your machine
# (`curl -sSL https://api.github.com/repos/<owner>/<repo>/releases/latest`).
curl -sSL "https://github.com/sharkdp/bat/releases/download/v0.26.1/bat-v0.26.1-x86_64-unknown-linux-gnu.tar.gz" \
  | tar xz -C /tmp && cp /tmp/bat-*/bat "$HOME/.local/bin/bat"
curl -sSL "https://github.com/eza-community/eza/releases/download/v0.23.5/eza_x86_64-unknown-linux-gnu.tar.gz" \
  | tar xz -C "$HOME/.local/bin"
```

#### zsh-abbr

No `apt` package and no official installer script; install it manually
(no Homebrew required either — `install.sh` does this automatically on a
machine without Homebrew):

```sh
git clone https://github.com/olets/zsh-abbr --recurse-submodules \
  --single-branch --branch main --depth 1 "$HOME/.config/zsh-abbr"
```

`00-tools.zsh` sources `~/.config/zsh-abbr/zsh-abbr.zsh` automatically when
Homebrew isn't present.

### tmux

See [`tmux/README.md`](tmux/README.md) — covers `.tmux.conf` symlinking,
TPM, required plugins, and `tmuxscope` scope file installation. Fully
cross-platform: dark/light theme detection falls back to the light palette
on Linux unless `TMUX_THEME=dark` is set (macOS reads `defaults` instead).

### git

See [`git/README.md`](git/README.md) — portable `git config --global`
defaults, the `~/.gitconfig.local` pattern for your name/email/signing key,
GPG commit-signing setup (and the tty errors that show up on Linux/tmux),
and per-OS credential storage.

### Window manager and Linux desktop stack

Pick the one for your OS — bindings, workspace layout, and window rules are
kept in parity between the two (documented inline where they diverge).

#### macOS: AeroSpace

```sh
brew install --cask aerospace
ln -sfn "$HOME/my-setup/.aerospace.toml" "$HOME/.aerospace.toml"
```

The config uses semantic `main`/`secondary` monitor selectors and `$HOME`-
relative helper script paths, so it doesn't hardcode a username or machine
name. It does reference machine-specific helper scripts under
`~/.config/aerospace/*.sh` (e.g. `ghostty.sh`, `finder-single.sh`,
`obsidian-fullscreen.sh`, `coteditor-single.sh`, `focus-cards-layout.sh`) and
a handful of app bundle IDs (Ghostty, Chrome, Slack, Obsidian, 1Password,
etc.) — adjust `on-window-detected` rules for the apps installed on your
machine. Reload with `alt-shift-e` after editing.

`raycast/toggle-aerospace.sh` calls `aerospace enable toggle`. Add
`$HOME/my-setup/raycast` in Raycast under **Settings → Script Commands → Add
Script Directory**. Then find **Toggle AeroSpace** in Root Search, press `⌘K`,
choose **Configure Command → Record Hotkey**, and assign one global shortcut.
Use Raycast for the shortcut: AeroSpace stops intercepting keys when disabled,
so an AeroSpace binding cannot re-enable it. Disabling AeroSpace also moves
windows from hidden AeroSpace workspaces into the visible area.

#### Linux/Debian: i3 + keyd + picom + Alacritty + PipeWire

```sh
sudo apt install i3 i3-wm i3lock i3status python3 dex feh picom rofi \
  xss-lock network-manager network-manager-gnome pulseaudio-utils

mkdir -p "$HOME/.config/i3" "$HOME/.config/i3status"
ln -sfn "$HOME/my-setup/i3/config" "$HOME/.config/i3/config"
ln -sfn "$HOME/my-setup/i3/i3status/status.py" "$HOME/.config/i3status/status.py"
```

Then set up each companion piece — every one has its own README with
install commands and the values you need to adjust for your machine:

- [`keyd/README.md`](keyd/README.md) — system-wide (`/etc/keyd/`, needs
  `sudo`) Mac-keyboard remap: Caps Lock → F13 (bound to `fullscreen toggle`
  in `i3/config`), plus Cmd-style copy/paste chords on an actual Apple
  keyboard.
- [`picom/README.md`](picom/README.md) — low-overhead compositor config
  without GPU-specific driver flags.
- [`alacritty/README.md`](alacritty/README.md) — terminal emulator,
  launched by `i3/config`'s `$mod+Return` via `bin/alacritty`, which also
  shadows the plain `alacritty` command on `$PATH` so every launch path
  stays a single window.
- [`pipewire/README.md`](pipewire/README.md) — optional: a specific USB
  headset's RNNoise filter and a Firefox ESR mic-routing quirk fix. Skip
  entirely without that hardware/browser.
- [`bin/README.md`](bin/README.md) — `alacritty`, `audio-control`,
  `noise-cancel`, symlinked onto `$PATH`; the zsh aliases that wrap them
  are only defined when the scripts are actually present.
- [`i3/README.md`](i3/README.md) — host-specific app window classes and
  wallpaper, the GeistMono Nerd Font, and where i3 can't replicate an
  AeroSpace behavior (mouse-follows-focus, config auto-reload).

Select "i3" from your display manager's session list after checking that
your X11/display setup supports it; the installer does not change sessions.

### Oh My Pi (`omp`) agent

`~/.omp/agent/` is a **live runtime directory** once `omp` has run at least
once — it holds `agent.db`/`history.db`/`models.db`, `sessions/`, `blobs/`,
`cache/`, and `terminal-sessions/` alongside the config. Never symlink the
whole directory (`ln -sfn .../agent ~/.omp/agent`) — that replaces all of
it, including your session history and caches, with just this repo's tracked
files. Symlink `config.yml`, `models.yml`, `mcp.json`, `extensions/`, and
`skills/` individually instead, leaving everything else in place:

```sh
mkdir -p "$HOME/.omp/agent"
ln -sfn "$HOME/my-setup/.omp/agent/config.yml" "$HOME/.omp/agent/config.yml"
ln -sfn "$HOME/my-setup/.omp/agent/models.yml" "$HOME/.omp/agent/models.yml"
ln -sfn "$HOME/my-setup/.omp/agent/mcp.json"   "$HOME/.omp/agent/mcp.json"
ln -sfn "$HOME/my-setup/.omp/agent/extensions" "$HOME/.omp/agent/extensions"
ln -sfn "$HOME/my-setup/.omp/agent/skills"     "$HOME/.omp/agent/skills"
```

If `~/.omp/agent/config.yml` (or `models.yml`/`mcp.json`/`extensions/`/
`skills/`) already exists as a real file/directory, back it up first
(`cp -a` it somewhere) before the `ln -sfn` — `ln -sfn` on an existing real
file replaces it outright, and on an existing real *directory* it symlinks
into it instead of replacing it, which silently produces a stray nested
symlink rather than the intended swap. Remove the real directory first if
that's the case.

`config.yml` holds UI/theme/model-role preferences. `models.yml` declares
custom model providers; API keys are resolved at runtime through the
[1Password CLI](https://developer.1password.com/docs/cli/) (`op read
op://...`), so no secret is stored in this repo — install and sign in to
`op` for those providers to work. `mcp.json` declares OMP's MCP servers and
is currently empty (kept symlinked for future use, see `bin/styleguard/` for
this repo's actual Winston AI AI-detection integration, a standalone CLI
rather than an MCP server).
`extensions/` contains the native Perplexity Search API web-search override;
`skills/` contains custom omp skills.
Web search uses the native Perplexity Search API override rather than the
deprecated Sonar chat-completions path. It calls
`https://api.perplexity.ai/search`, requests detailed context, and returns
ranked sources to OMP's standard `web_search` tool. OMP does not expose
thinking-style effort tiers for model-kind web roles; the configured
`web/duckduckgo` entry remains a free fallback if the override cannot run.
The `omp` shell function resolves
`op://Personal/Perplexity Web Search/password` into the process environment
only for that invocation. The key is never written to this repository,
`.env`, or shell history. Start a new shell (or source the zsh config) after
installing/signing in to `op`.

## Notes

- Nothing here hardcodes a username or absolute machine path outside
  `$HOME`, with one documented exception:
  `pipewire/pipewire.conf.d/60-me6s-voice-isolation.conf`'s LADSPA plugin
  path, because PipeWire's config format doesn't expand environment
  variables — see [`pipewire/README.md`](pipewire/README.md).
- Every shell/tmux/git/i3 integration is written to no-op when its target
  binary isn't installed, so you can adopt pieces incrementally.
- **No hardcoded API keys, tokens, or credentials anywhere in this repo.**
  `.omp/agent/models.yml` resolves secrets through the 1Password CLI at
  runtime; `git/.gitconfig` deliberately excludes identity/signing
  key/credential-helper settings (they go in the untracked
  `~/.gitconfig.local`); zsh secrets belong in the untracked
  `~/.config/zsh/local.zsh`. If you ever find a real secret in a tracked
  rc.d file or config here, that's a bug — move it to the matching
  untracked/local file and, if it was ever committed, rotate it.
