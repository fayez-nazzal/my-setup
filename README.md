# my-setup

My machine setup for macOS and Linux: zsh, tmux, git, terminal, window
management, apps, and commit signing. One interactive installer sets it all
up and is safe to run again.

## Quick start

```sh
git clone git@github.com:fayez-nazzal/my-setup.git ~/my-setup
~/my-setup/install.sh
```

The installer shows a checklist for your system. Arrow keys move, Space
toggles, Enter installs, Esc cancels. `--dry-run` shows the plan without
changing anything.

- Things already installed and set up correctly are left alone.
- Files it would replace are moved to `~/.dotfiles-backup-*` first.
- It asks for your password only when a step needs it.
- Anything it could not finish is listed at the end under "Needs your
  attention".

AI agents: read [`AGENTS.md`](AGENTS.md) first.

## What it sets up

| Group | Items |
| --- | --- |
| Configuration | zsh, git, tmux, tmuxscope, Alacritty, Oh My Pi, styleguard |
| OS configuration | AeroSpace, Amphetamine (macOS); GNOME, keyd (Linux) |
| Software | zsh, git, tmux and plugins, starship, zoxide, fzf, bat, eza, fd, ripgrep, thefuck, killport, Volta, Node LTS, Alacritty, Geist Mono Nerd Font, my GitHub tools, 1Password, 1Password CLI, GitHub CLI, Obsidian |
| Accounts and signing | 1Password CLI sign-in, GitHub CLI sign-in, git commit signing |
| OS software and settings | AeroSpace, Google Chrome, OrbStack, Amphetamine, macOS settings (macOS); desktop packages, keyd, GNOME settings (Linux) |

Configuration files are symlinked from this repo, so editing them here
changes your machine.

## Platforms

- **macOS**: uses Homebrew, which the installer offers to install first.
  Chrome, OrbStack, 1Password, and Obsidian come from Homebrew. Amphetamine
  comes from the App Store through Homebrew's `mas`.
- **Linux**: package installs need APT (Debian or Ubuntu). Both amd64 and
  arm64 are supported.
- **Linux servers**: when there is no desktop, items that need one are turned
  off: Alacritty, the font, GNOME, keyd, 1Password, and Obsidian. The shell,
  git, the 1Password CLI, the GitHub CLI, and signing still work.

## 1Password and commit signing

1Password holds every secret. The installer only refers to items by name:

| Item | Type | Used for |
| --- | --- | --- |
| `GPG Key Password` | Login | Passphrase of the GPG key |
| `GPG Secret Key` | Document | Backup of the GPG key, so new machines can import it |
| `SSH Key` | SSH key | SSH signing and the 1Password SSH agent |

The steps run in this order:

1. **1Password CLI sign-in** installs `op` if needed. With the 1Password app
   it asks you to turn on CLI integration. Without it, `op` asks for your
   address, email, Secret Key, and password.
2. **GitHub CLI sign-in** runs `gh auth login` with a code you enter in any
   browser.
3. **Commit signing** keeps the method you already use, or asks: GPG or SSH.
   - GPG uses the key on this machine, or imports it from 1Password. It checks
     the passphrase and offers to back up the key to 1Password.
   - SSH signs with the 1Password app. A server without the app gets a copy
     of the key that is protected by the `GPG Key Password` passphrase.

   Either way it adds the key to GitHub and checks a signed test commit.

Signing settings go to `~/.gitconfig.local`, never to the tracked
`git/.gitconfig`. Details are in [`git/README.md`](git/README.md).

## macOS settings

**Apply AeroSpace macOS settings** changes only values that differ:

- Displays share one set of Spaces (needs a log out)
- Mission Control groups windows by app
- No window opening animations
- Ctrl+Cmd drag moves a window
- Dock at the bottom, hidden, shows after 1 second, no bouncing icons

Change them in `macDefaults` in `installer/infrastructure/desktop.ts`.

AeroSpace builds from source when full Xcode is installed and rebuilds when
`main` changes. Otherwise it installs from Homebrew.

## More docs

- [`zsh/README.md`](zsh/README.md): shell load order and local settings
- [`git/README.md`](git/README.md): git defaults, signing, credentials
- [`tmux/README.md`](tmux/README.md): tmux, plugins, scopes
- [`alacritty/README.md`](alacritty/README.md): terminal
- [`amphetamine/README.md`](amphetamine/README.md): keeping the Mac awake
- [`gnome/README.md`](gnome/README.md), [`keyd/README.md`](keyd/README.md): Linux desktop
- [`tools/README.md`](tools/README.md): my GitHub tools
- [`bin/README.md`](bin/README.md): scripts

## Oh My Pi

`~/.omp/agent` also holds sessions and history, so only these are linked:
`config.yml`, `models.yml`, `extensions/`, and `skills/`. Never link the
whole folder. API keys are read from 1Password at run time with `op read`.

## Secrets

No secret lives in this repo. Machine settings go in `~/.gitconfig.local`
and `~/.config/zsh/local.zsh`, which git ignores. If you ever find a secret
in a tracked file, move it out and rotate it.
