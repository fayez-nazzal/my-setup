# my-setup

An interactive, safe-to-rerun setup for macOS and Debian/Ubuntu: shell and
terminal configs, developer tools, apps, and desktop settings.

## Install

```sh
git clone git@github.com:fayez-nazzal/my-setup.git ~/my-setup
~/my-setup/install.sh
```

Arrow keys move, Space selects, Enter runs, Esc cancels. Preview without
configuration changes:

```sh
~/my-setup/install.sh --dry-run
```

Correct installs are skipped. Replaced user files are backed up to
`~/.dotfiles-backup-*`. Unfinished steps appear under **Needs your attention**.
Most configs are symlinked, so editing this repo changes your machine.

## Platforms and prerequisites

- **macOS:** Full Xcode is required, not just Command Line Tools. The installer
  checks developer selection, license, first launch, SDK, and compiler before
  Homebrew, Bun, or tool installs. Missing Xcode uses the prompted App Store
  install-and-retry flow. Homebrew is offered if absent.
- **Permissions:** Needed grants come before affected operations: Automation
  for System Events/Amphetamine, app-data access or Full Disk Access for
  Amphetamine preferences, and Accessibility for AeroSpace. Denial blocks
  that operation. Some grants require restarting the terminal and retrying.
- **Debian/Ubuntu:** amd64 and arm64 use signed official downloads and APT.
  Headless systems skip desktop-only choices but retain shell and developer tools.

1Password and its CLI are installed before integration and sign-in dialogs.
Account dialogs happen before long builds.

## Everyday behavior

- **AWS and Java:** Select AWS CLI v2, Amazon Corretto 21, and Corretto 21
  `JAVA_HOME`. AWS credentials stay unchanged; `aws configure sso` is optional.
  The login snippet at `zsh/.config/zsh/profile.d/30-java-home.zsh` selects
  Corretto 21, exports `JAVA_HOME`, and puts its `bin` first on `PATH`.
  Open a new login shell afterward.
- **Terminal:** Alacritty settles on one default window sharing a marked tmux
  session, even after tmuxscope renames it. Explicit `alacritty -e CMD` windows
  stay independent. Existing windows keep their shells; finish their work and
  close them before adopting this policy. The installer does not close your work.
- **Signing and secrets:** Setup signs into 1Password, then GitHub, preserves
  or selects GPG/SSH signing, and verifies a temporary signed commit.
  See [Git](git/README.md) for required 1Password items. Identity and secrets
  belong in untracked `~/.gitconfig.local` and `~/.config/zsh/local.zsh`.
  Rotate exposed secrets.
- **OMP and writing:** Only selected configuration, extensions, skills, and
  the writer definition are linked—not the whole agent folder with sessions
  and history. The role-backed writer handles bounded writing without tools.

## Details

[Shell](zsh/README.md) · [Git](git/README.md) · [tmux](tmux/README.md) ·
[Alacritty](alacritty/README.md) · [Amphetamine](amphetamine/README.md) ·
[GNOME](gnome/README.md) · [keyd](keyd/README.md) ·
[Tools](tools/README.md) · [Scripts](bin/README.md)

AI agents: read [AGENTS.md](AGENTS.md) first.
