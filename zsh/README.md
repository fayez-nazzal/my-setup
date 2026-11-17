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
   PATH, and Corretto 21 `JAVA_HOME` when present.
3. `.zshrc` runs in interactive shells and loads `rc.d/*.zsh` in name order:
   GPG terminal setup, prompt, tool setup, history, key bindings, aliases,
   completion, and zoxide.

Each file is loaded once, so sourcing again is safe.

The optional `java-home` installer choice requires Amazon Corretto 21 and
`zsh-config`. Its `profile.d/30-java-home.zsh` finds a Corretto 21 JDK by its
release metadata, sets `JAVA_HOME`, and prepends its `bin` directory to PATH
in login shells. It does not modify other JDK installations; no machine-specific
path is written.

## Credentials

This setup does not launch password managers, read OS credential stores, or
propagate tokens between applications. Supply only the credentials a session
needs through its machine-local environment. `.omp/agent/models.yml` uses
`TYPESAFE_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and
`OPENROUTER_API_KEY`; web search uses `PERPLEXITY_API_KEY`; Excalidraw uses
`EXCALIDRAW_API_KEY`. Styleguard uses `OPENAI_API_KEY` and `WINSTON_API_KEY`.
Claude Code's optional Excalidraw helper uses `MY_SETUP_CLAUDE_EXCALIDRAW_KEY`.
Leave a variable unset when its provider is not needed.

Do not place credentials in the checkout, shell history, or command arguments.
Unset obsolete variables in existing sessions before starting a new session.


## Local settings

Put machine-only settings and secrets in `~/.config/zsh/local.zsh`. It loads
last and git ignores it.

## Tools it uses

starship, thefuck, fzf, fd, bat, eza, zoxide, zsh-abbr, killport, Volta,
pnpm, and the GitHub tools in [`../tools`](../tools/README.md). Each one is
optional; a missing tool is skipped. The installer offers all of them.

On Debian, `fd` installs as `fdfind` and `bat` may install as `batcat`. The
installer recognizes both.
