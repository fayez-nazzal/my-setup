# zsh

## Install

The installer links these. By hand:

```sh
ln -sfn ~/my-setup/zsh/.zshenv   ~/.zshenv
ln -sfn ~/my-setup/zsh/.zprofile ~/.zprofile
ln -sfn ~/my-setup/zsh/.zshrc    ~/.zshrc
ln -sfn ~/my-setup/zsh/.config/zsh ~/.config/zsh
```

The installer does not change your login shell. On Linux run
`chsh -s "$(command -v zsh)"` and log in again.

## How it loads

1. `.zshenv` runs in every shell.
2. `.zprofile` runs in login shells and loads `profile.d/*.zsh`: Homebrew,
   PATH, and OrbStack when present.
3. `.zshrc` runs in interactive shells and loads `rc.d/*.zsh` in name order:
   GPG terminal setup, prompt, tool setup, history, key bindings, aliases,
   completion, and zoxide.

Each file is loaded once, so sourcing again is safe.

## Local settings

Put machine-only settings and secrets in `~/.config/zsh/local.zsh`. It loads
last and git ignores it.

## Tools it uses

starship, thefuck, fzf, fd, bat, eza, zoxide, zsh-abbr, killport, Volta,
pnpm, and the GitHub tools in [`../tools`](../tools/README.md). Each one is
optional; a missing tool is skipped. The installer offers all of them.

On Debian, `fd` installs as `fdfind` and `bat` may install as `batcat`. The
installer recognizes both.
