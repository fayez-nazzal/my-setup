# my-setup

Personal dotfiles for zsh, tmux, window management, git, and
[Oh My Pi](https://github.com) (`omp`) agent configuration — cross-platform
between macOS (AeroSpace) and Linux (GNOME + keyd + Alacritty + Vicinae).
Everything is designed to be symlinked from `$HOME` (or, for `keyd`, from
`/etc/keyd/`) and to degrade gracefully when an optional tool isn't installed
— a missing binary is skipped, not a fatal error.

The Linux side is this setup's real desktop config, but its core defaults
are portable — host-specific app classes and keyboard-device IDs are called
out inline and in each directory's README rather than hidden or faked.

Linux desktop package automation is APT-only (Debian/Ubuntu); other Linux
distributions retain portable configuration links and supported user-local
routes. On macOS, Homebrew is optional and bootstrapped only after consent.

## Layout

```
.
├── AGENTS.md            Index for an AI agent asked to install this repo
├── install.sh           Interactive Bun/OpenTUI installer
├── .aerospace.toml      AeroSpace tiling window manager config (macOS)
├── gnome/
│   ├── dconf.ini          Declarative GNOME workspaces/keybindings
│   ├── apply.sh           Apply/dump GNOME settings
│   ├── xdg-terminals.list GNOME default-terminal selection
│   └── README.md          GNOME parity and sync workflow
├── keyd/                 System-wide (/etc/keyd/) Mac-keyboard remap
├── alacritty/            Terminal emulator config
├── bin/                  Scripts symlinked onto $PATH (~/.local/bin)
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
    ├── extensions/      Native OMP extensions
    └── skills/          Custom omp skills
```

## Requirements

Core, both platforms:

- [zsh](https://www.zsh.org/) (ships with macOS; `sudo apt install zsh` on Debian)
- git

macOS only:
- [Homebrew](https://brew.sh/) — supported recipes prefer it. The installer
  offers to bootstrap it (Enter accepts), which also installs the Xcode
  command-line tools. Linux never bootstraps Homebrew, though an existing
  Linuxbrew installation is usable.
- Full [Xcode](https://apps.apple.com/app/xcode/id497799835) for the AeroSpace
  source build. Without it the installer falls back to the AeroSpace cask.

Linux/Debian: native package installation is APT-only. The optional Linux
desktop bundle provides this repository's audio/network/rofi setup:

```sh
sudo apt install rofi network-manager network-manager-gnome pulseaudio-utils \
  pipewire pipewire-audio-client-libraries wireplumber
```

Core tools, Alacritty, Geist Mono Nerd Font, and keyd appear as separate
installer choices. When APT has no `keyd` candidate, the installer offers the
documented stable upstream source route (see [`keyd/README.md`](keyd/README.md)).
Non-APT Linux remains usable for portable configuration links and verified
user-local routes; unsupported package choices stay disabled.

PipeWire remains part of the Linux desktop's normal audio stack; this repo
does not ship headset-specific PipeWire filters or routing overrides.

## Setup

Clone the repo, then run the interactive installer or symlink selected
pieces by hand.

```sh
git clone git@github.com:fayez-nazzal/my-setup.git "$HOME/my-setup"
"$HOME/my-setup/install.sh"
```

`install.sh` starts an OS-aware checklist. Supported choices begin selected;
Space toggles a choice and Enter applies the selected work. Existing software
is detected before installation, and conflicting user files are retained in
a private backup directory before links are replaced. `--dry-run` shows the
selected operations without changing component state; `--help` does not
bootstrap prerequisites. The installer does not invent identity, secrets, or
hardware IDs, and does not change the login shell.

The installer repairs what it can instead of reporting it:

- Files under the repo, `~/.bun`, `~/.cache`, `~/.config`, `~/.local`, and
  similar tool directories that belong to another user (usually left by an
  earlier `sudo` run) are given back with `sudo chown -R`.
- Before inspecting software it runs `brew update`. Homebrew-managed tools that
  `brew outdated` lists show as "update available" and get upgraded. A
  Homebrew or APT package whose executable fails its version probe is
  reinstalled.
- sudo asks for your password only when a step needs it (APT, `/etc/keyd`, an
  unwritable `/Applications`, Xcode license/first-launch, ownership repair).
  The credential is kept fresh for the rest of the run, so long builds don't
  ask again.
- Configuration links run after the software they configure, so the
  missing-executable check sees tools installed in the same run.

What remains goes under "Needs your attention". An AI coding agent asked to
set this repo up should read [`AGENTS.md`](AGENTS.md) first.

The software list includes **Volta** (installed from the official
`https://get.volta.sh` script with `--skip-setup` into `~/.volta`, since
`zsh/.zshenv` already exports `VOLTA_HOME` and puts `$VOLTA_HOME/bin` on
`PATH`) and **Node LTS (via Volta)**, which runs `volta install node` to
download the current LTS as Volta's default runtime. Selecting Node LTS also
selects Volta; a healthy Volta or an existing Volta default Node is left
alone. A Node installed some other way does not count: Node here is always
Volta-managed.

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
`ffn`/`ffc` search below the current directory: `ffn` matches filenames;
`ffc` searches file contents using ripgrep when available and `grep`
otherwise.

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
cross-platform: Linux defaults to the dark palette; macOS follows system
dark mode and otherwise uses the light palette. `TMUX_THEME=dark` forces
the dark palette on either platform.

### git

See [`git/README.md`](git/README.md) — portable `git config --global`
defaults, the `~/.gitconfig.local` pattern for your name/email/signing key,
GPG commit-signing setup (and the tty errors that show up on Linux/tmux),
and per-OS credential storage.

### Window manager and Linux desktop stack

Choose the configuration for your OS.

#### macOS: AeroSpace

The installer builds AeroSpace from the `main` branch with upstream's
`build-release.sh`. The checkout is a build cache in
`~/.cache/my-setup/AeroSpace`. The build steps:

- Installs the build prerequisites with Homebrew: bash 5, `swiftly` and the
  Swift toolchain pinned in `.swift-version`, the Ruby 3.x the docs need,
  `fish`, and Rust.
- Accepts the Xcode license and runs first-launch setup when needed (sudo).
- Creates a self-signed `aerospace-codesign-certificate` code-signing identity
  in your login keychain once. macOS keeps the Accessibility permission across
  rebuilds only when the signing identity stays the same. The installer asks
  for your login keychain password once so `codesign` can use the key without
  a dialog on every build.
- Installs `AeroSpace.app` to `/Applications` (replacing the Homebrew cask if
  it is installed), the CLI to `~/.local/bin/aerospace`, the man pages to
  `~/.local/share/man`, and the zsh completion to
  `~/.local/share/zsh/site-functions`, then launches the app.

Rerunning the installer rebuilds AeroSpace only when `main` has moved.
Without full Xcode, it installs the `nikitabobko/tap/aerospace` cask instead:

```sh
brew install --cask nikitabobko/tap/aerospace
ln -sfn "$HOME/my-setup/.aerospace.toml" "$HOME/.aerospace.toml"
```

The config uses semantic `main`/`secondary` monitor selectors and `$HOME`-
relative helper paths. Its shipped Alt+Enter helper focuses the existing
Alacritty window or launches `~/.local/bin/alacritty`; adjust app bundle IDs
in `on-window-detected` for installed apps. Reload with `alt-shift-e` after
editing.

#### Linux/Debian: GNOME + keyd + Alacritty

The installer exposes this Linux APT desktop bundle, keyd configuration,
Alacritty configuration, and GNOME settings application as separate choices.
GNOME settings are applied only when selected from an active dconf session.
Otherwise run `~/.local/bin/my-setup-gnome` after logging into GNOME.

- [`keyd/README.md`](keyd/README.md) — system-wide (`/etc/keyd/`, needs
  `sudo`) Mac-keyboard remap: Command shortcuts, Command+Space for Vicinae,
  and Caps Lock → F13 for GNOME fullscreen.
- [`alacritty/README.md`](alacritty/README.md) — terminal configuration and
  the tmux-backed launcher.
- [`gnome/README.md`](gnome/README.md) — fixed workspaces, Alt/Option
  workspace chords, Vicinae app search and clipboard history, Alacritty, and
  keyd/Caps Lock behavior.
- [`bin/README.md`](bin/README.md) — the Alacritty launcher and styleguard
  CLI.

### Oh My Pi (`omp`) agent

`~/.omp/agent/` is a **live runtime directory** once `omp` has run at least
once — it holds `agent.db`/`history.db`/`models.db`, `sessions/`, `blobs/`,
`cache/`, and `terminal-sessions/` alongside the config. Never symlink the
whole directory (`ln -sfn .../agent ~/.omp/agent`) — that replaces all of
it, including your session history and caches, with just this repo's tracked
files. Symlink `config.yml`, `models.yml`, `extensions/`, and `skills/`
individually instead, leaving everything else in place:

```sh
mkdir -p "$HOME/.omp/agent"
ln -sfn "$HOME/my-setup/.omp/agent/config.yml" "$HOME/.omp/agent/config.yml"
ln -sfn "$HOME/my-setup/.omp/agent/models.yml" "$HOME/.omp/agent/models.yml"
ln -sfn "$HOME/my-setup/.omp/agent/extensions" "$HOME/.omp/agent/extensions"
ln -sfn "$HOME/my-setup/.omp/agent/skills"     "$HOME/.omp/agent/skills"
```

If `~/.omp/agent/config.yml` (or `models.yml`/`extensions/`/`skills/`)
already exists as a real file/directory, back it up first (`cp -a` it
somewhere) before the `ln -sfn` — `ln -sfn` on an existing real file
replaces it outright, and on an existing real *directory* it symlinks into
it instead of replacing it, which silently produces a stray nested symlink
rather than the intended swap. Remove the real directory first if that's the
case.

`config.yml` holds UI/theme/model-role preferences. `models.yml` declares
custom model providers; API keys are resolved at runtime through the
[1Password CLI](https://developer.1password.com/docs/cli/) (`op read
op://...`), so no secret is stored in this repo — install and sign in to
`op` for those providers to work. `extensions/` contains the native
Perplexity Search API web-search override; `skills/` contains custom omp
skills.
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

- **No hardcoded API keys, tokens, or credentials anywhere in this repo.**
  `.omp/agent/models.yml` resolves secrets through the 1Password CLI at
  runtime; `git/.gitconfig` deliberately excludes identity/signing
  key/credential-helper settings (they go in the untracked
  `~/.gitconfig.local`); zsh secrets belong in the untracked
  `~/.config/zsh/local.zsh`. If you ever find a real secret in a tracked
  rc.d file or config here, that's a bug — move it to the matching
  untracked/local file and, if it was ever committed, rotate it.
