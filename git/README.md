# git setup

`git/.gitconfig` holds portable, machine-independent defaults (default
branch, push/pull/rebase behavior, aliases). It intentionally contains no
identity, signing key, or credential helper — those are personal and/or
platform-specific and belong in `~/.gitconfig.local`, which
`git/.gitconfig` `[include]`s but this repo never creates or tracks.

## Install

```sh
ln -sfn "$HOME/my-setup/git/.gitconfig" "$HOME/.gitconfig"
```

Back up an existing `~/.gitconfig` first (`git config --global --list
--show-origin` shows what's currently set).

## `~/.gitconfig.local` (create once per machine, not tracked)

```ini
[user]
	name = Your Name
	email = you@example.com
	# GPG key id (`gpg --list-secret-keys --keyid-format=long`), only if you
	# sign commits/tags:
	# signingkey = ABCDEF0123456789

[commit]
	# gpgsign = true
[tag]
	# gpgsign = true
```

Nothing here is a secret by itself, but it's still personal and
machine-specific (e.g. a different signing key on a work laptop), so it's
kept out of the repo the same way `zsh/.config/zsh/local.zsh` is.

Fastest way to create it non-interactively:

```sh
git config --file "$HOME/.gitconfig.local" user.name "Your Name"
git config --file "$HOME/.gitconfig.local" user.email "you@example.com"
```

## GPG signing errors

If `git commit -S` fails with `gpg: signing failed: Inappropriate ioctl for
device` or hangs waiting on pinentry, it's almost always a stale `GPG_TTY` —
common on Linux/Debian and inside tmux, since a new terminal/pane gets its
own tty. `zsh/.config/zsh/rc.d/05-gpg.zsh` in this repo sets `GPG_TTY`,
launches `gpg-agent`, and re-registers the current tty with the agent on
every interactive shell start, so this should not come up once the zsh
config is linked. If it still does:

```sh
export GPG_TTY=$(tty)
gpg-connect-agent updatestartuptty /bye
```

Debian also needs a pinentry program installed for the passphrase prompt to
appear at all: `sudo apt install pinentry-curses` (TTY prompt) or
`pinentry-gnome3` (graphical, under a desktop session/i3 with a keyring
agent running).

## Credential storage

Deliberately not set in the tracked config — pick per machine in
`~/.gitconfig.local`:

- **macOS**: `git config --global credential.helper osxkeychain` (ships with
  Xcode Command Line Tools' git).
- **Debian/Linux**: install [Git Credential
  Manager](https://github.com/git-ecosystem/git-credential-manager) (`.deb`
  release asset, no Homebrew needed) and run `git-credential-manager
  configure`, or fall back to `git config --global credential.helper 'cache
  --timeout=3600'` for an in-memory-only cache.
