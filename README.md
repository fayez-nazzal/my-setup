# my-setup

Personal macOS dotfiles: zsh, tmux, AeroSpace (tiling window manager), and
[Oh My Pi](https://github.com) (`omp`) agent configuration. Everything is
designed to be symlinked from `$HOME` and to degrade gracefully when an
optional tool isn't installed — a missing binary is skipped, not a fatal error.

## Layout

```
.
├── .aerospace.toml     AeroSpace tiling window manager config
├── .tmux.conf          Portable tmux config (see tmux/README.md for setup)
├── tmux/
│   ├── README.md       tmux-specific install/plugin instructions
│   └── tmux-scopes.conf  tmuxscope project scope definitions
├── zsh/
│   ├── .zshenv         Always-sourced: Volta, cargo env
│   ├── .zprofile       Login shell: loads profile.d/*
│   ├── .zshrc          Interactive shell: loads rc.d/*
│   ├── .gitignore      Keeps machine-local zsh files out of git
│   └── .config/zsh/
│       ├── lib/load.zsh    zrc_source / zrc_load_dir helpers (dedup + load *.zsh in order)
│       ├── profile.d/      Login-time setup (Homebrew shellenv, PATH, OrbStack)
│       └── rc.d/           Interactive setup (prompt, tool init, aliases, keybindings, completion)
└── .omp/agent/
    ├── config.yml      Oh My Pi UI/theme/model-role settings
    ├── models.yml      Custom model provider definitions (reads secrets via 1Password CLI)
    └── skills/         Custom omp skills
```

## Requirements

Core:

- macOS (AeroSpace and some `defaults`/Homebrew paths are macOS-only)
- [zsh](https://www.zsh.org/) (ships with macOS)
- [Homebrew](https://brew.sh/)

Everything else referenced below is optional — each integration checks
`command -v` before doing anything, so an uninstalled tool is silently
skipped.

## Setup

Clone the repo, then symlink the pieces you want.

```sh
git clone git@github.com:REDACTED-REDACTED/my-setup.git "$HOME/my-setup"
```

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

Load order: `.zshenv` (every shell) → `.zprofile` (login shells, sources
`profile.d/*.zsh` in filename order) → `.zshrc` (interactive shells, sources
`rc.d/*.zsh` in filename order). `zrc_load_dir` (in `lib/load.zsh`) dedupes
sourced files, so re-sourcing is safe.

`profile.d/` sets up Homebrew's shellenv, dedupes `$PATH`, and sources
OrbStack's shell init when present.

`rc.d/` initializes the interactive environment: prompt (`starship`),
`thefuck`, `fzf` (+ `fd`-backed completion, `fzf-git.sh` if cloned to
`~/fzf-git.sh`), `bat`/`eza` aliases for `cat`/`ls`, `zsh-abbr` via Homebrew,
tool `PATH` entries (Volta/pnpm/bun/opencode/grok/jbang), `wt`/`nag`/
`tmuxscope` shell hooks, `EXTENDED_HISTORY`, `gl` git-log alias and `ffn`/`ffc`
find helpers, a `histago`+`fzf` `Ctrl-R` history search, zsh completion
(`compinit -C`), and `zoxide` (aliases `cd` to `z` when present).

Machine-local overrides that shouldn't be tracked go in
`~/.config/zsh/local.zsh` (auto-sourced last, git-ignored by
`zsh/.gitignore` along with `*.local.zsh` and `.env*`).

Recommended tools for the full experience: `starship`, `thefuck`, `fzf`,
`fd`, `bat`, `eza`, `zoxide`, `zsh-abbr`, [`histago`](https://github.com),
[`tmuxscope`](https://github.com/REDACTED-REDACTED/tmuxscope), `wt`, `nag`,
Volta, pnpm.

### tmux

See [`tmux/README.md`](tmux/README.md) — covers `.tmux.conf` symlinking,
TPM, required plugins, and `tmuxscope` scope file installation.

### AeroSpace

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

### Oh My Pi (`omp`) agent

```sh
mkdir -p "$HOME/.omp"
ln -sfn "$HOME/my-setup/.omp/agent" "$HOME/.omp/agent"
```

`config.yml` holds UI/theme/model-role preferences. `models.yml` declares
custom model providers; API keys are resolved at runtime through the
[1Password CLI](https://developer.1password.com/docs/cli/) (`op read
op://...`), so no secret is stored in this repo — install and sign in to
`op` for those providers to work. `skills/` contains custom omp skills
available across sessions.

## Notes

- Nothing here hardcodes a username or absolute machine path outside
  `$HOME`; the repo is meant to be cloned to `~/my-setup` on any macOS
  machine and re-linked.
- Every shell/tmux integration is written to no-op when its target binary
  isn't installed, so you can adopt pieces incrementally.
