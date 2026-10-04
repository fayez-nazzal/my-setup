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
```

Nothing here is a secret by itself, but it's still personal and
machine-specific (e.g. a different signing key on a work laptop), so it's
kept out of the repo the same way `zsh/.config/zsh/local.zsh` is.

Write it with `git config --file "$HOME/.gitconfig.local"`, never
`git config --global`: `~/.gitconfig` is a link to this public repository's
`git/.gitconfig`, so `--global` writes into the tracked file. Values there also
come after the `[include]`, so they override `~/.gitconfig.local`.

```sh
git config --file "$HOME/.gitconfig.local" user.name "Your Name"
git config --file "$HOME/.gitconfig.local" user.email "you@example.com"
```

## Commit signing with 1Password

The installer's **Git commit signing (1Password)** choice sets this up and
verifies it (see the top-level README). It keeps whichever method `gpg.format`
already names.

### GPG (OpenPGP)

The passphrase is the password of the 1Password Login item `GPG Key Password`.
The secret key (still passphrase-protected) is the Document item
`GPG Secret Key`, which lets a new machine import it. By hand:

```sh
local="$HOME/.gitconfig.local"
fpr="$(git config user.signingkey)"   # or pick one from: gpg --list-secret-keys --keyid-format=long
# New machine: import the key from 1Password (pinentry asks for the passphrase).
op document get "GPG Secret Key" --out-file /tmp/gpg-secret-key.asc && gpg --import /tmp/gpg-secret-key.asc && rm /tmp/gpg-secret-key.asc
printf '%s:6:\n' "$fpr" | gpg --import-ownertrust
# Machine that has the key: store it in 1Password once.
gpg --armor --export-secret-keys "$fpr" | op document create - --title "GPG Secret Key" --file-name gpg-secret-key.asc
git config --file "$local" --unset gpg.ssh.program
git config --file "$local" gpg.format openpgp
git config --file "$local" user.signingkey "$fpr"
git config --file "$local" commit.gpgsign true
gpg --armor --export "$fpr" > /tmp/gpg-public.asc && gh gpg-key add /tmp/gpg-public.asc --title "$(git config user.name)"
```

macOS needs `brew install gnupg pinentry-mac` and
`pinentry-program $(brew --prefix)/bin/pinentry-mac` in
`~/.gnupg/gpg-agent.conf` (then `gpgconf --kill gpg-agent`). Debian needs
`gnupg` plus a pinentry (see below).

### SSH

On a machine with the 1Password app (SSH agent and CLI integration enabled in
Settings → Developer):

```sh
local="$HOME/.gitconfig.local"
key="$(op read 'op://Personal/SSH Key/public key')"
git config --file "$local" gpg.format ssh
git config --file "$local" user.signingkey "$key"
git config --file "$local" gpg.ssh.program /Applications/1Password.app/Contents/MacOS/op-ssh-sign   # Linux: /opt/1Password/op-ssh-sign
git config --file "$local" gpg.ssh.allowedSignersFile "$HOME/.config/git/allowed_signers"
git config --file "$local" commit.gpgsign true
printf '%s namespaces="git" %s\n' "$(git config user.email)" "$key" >> "$HOME/.config/git/allowed_signers"
gh ssh-key add <(printf '%s\n' "$key") --type signing --title "1Password SSH Key"
```

Without the app (a server), the installer writes the key to
`~/.ssh/id_1password_signing`, encrypted with the `GPG Key Password` item's
password, sets `user.signingkey` to that path, and leaves `gpg.ssh.program`
unset so `ssh-keygen` signs (from your ssh-agent when it holds the key).
`git log --show-signature` checks signatures locally through
`allowed_signers`; GitHub shows Verified once the key is registered as a
signing key and the commit email is verified on your account.

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

Deliberately not set in the tracked config — pick per machine in
`~/.gitconfig.local`:

- **macOS**: `git config --file ~/.gitconfig.local credential.helper osxkeychain` (ships with
  Xcode Command Line Tools' git).
- **Debian/Linux**: install [Git Credential
  Manager](https://github.com/git-ecosystem/git-credential-manager) (`.deb`
  release asset, no Homebrew needed) and run `git-credential-manager
  configure`, or fall back to `git config --file ~/.gitconfig.local credential.helper 'cache
  --timeout=3600'` for an in-memory-only cache. With the GitHub CLI choice, `gh auth setup-git`
  (run by the GitHub CLI sign-in step on HTTPS machines) covers github.com.
