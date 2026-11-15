# git setup

`git/.gitconfig` holds portable, machine-independent defaults (default
branch, push/pull/rebase behavior, aliases). It intentionally contains no
identity, signing key, or credential helper — those are personal and/or
platform-specific and belong in `~/.gitconfig.local`, which the installer
makes `~/.gitconfig` include last. This repo never creates or tracks it.

## Install

The installer's **git configuration** step writes no symlink. `~/.gitconfig`
becomes a private regular file (mode 0600) with two managed blocks:

- a top block that includes this repository's `git/.gitconfig` defaults;
- your own lines, kept in place (credentials, `includeIf`, anything else);
- a bottom block that includes `~/.gitconfig.local`, so its values load last.

Re-running the step only rewrites the managed blocks, so it is safe to repeat.
Before replacing an existing `~/.gitconfig`, it moves the old file into a
`~/.dotfiles-backup-*` directory. A legacy symlink to `git/.gitconfig` is
replaced; its `user.name` and `user.email` move into `~/.gitconfig.local`
where that file does not already set them. The step blocks, and leaves
everything untouched, when `~/.gitconfig` is a symlink to anything else, a
directory, or malformed.

## `~/.gitconfig.local` (create once per machine, not tracked)

```ini
[user]
	name = Your Name
	email = you@example.com
```

Nothing here is a secret by itself, but it's still personal and
machine-specific (e.g. a different signing key on a work laptop), so it's
kept out of the repo the same way `zsh/.config/zsh/local.zsh` is.

Write it with `git config --file "$HOME/.gitconfig.local"`. Avoid
`git config --global` for identity and signing: it writes to `~/.gitconfig`,
and values there load after `~/.gitconfig.local`, so they override it.

```sh
git config --file "$HOME/.gitconfig.local" user.name "Your Name"
git config --file "$HOME/.gitconfig.local" user.email "you@example.com"
```

## Commit signing

The installer does not provision signing keys, SSH agents, or signing-key
registration. Configure an existing local key in `~/.gitconfig.local` and
register its public key with GitHub separately.

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
`pinentry-gnome3` (graphical, under a GNOME desktop session with a keyring
agent running).

## Credential storage

Deliberately not set in the tracked config or installer. Do not enable `gh` as
a Git credential helper, store GitHub tokens on disk, or use SSH authentication
on shared/company machines. Supply a fine-grained token only to the process
that needs it, scoped to the required repositories and permissions.
