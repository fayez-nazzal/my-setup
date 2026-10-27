# tools/ — GitHub tools built from source

[`tools.conf`](tools.conf) is the single source of truth for the owner's
GitHub tools: each is cloned into `~/tools/<name>`, built from source, and
symlinked into `~/.local/bin`. [`sync.sh`](sync.sh) does the work; it is linked
as `~/.local/bin/my-setup-tools`, and both `./install.sh` (choice **GitHub
tools**) and the twice-daily cron job run it.

| Tool | Platforms | Build | Command |
| --- | --- | --- | --- |
| [tmuxscope](https://github.com/fayez-nazzal/tmuxscope) | macOS, Linux | `bun run build` | `tmuxscope` → `dist/tmuxscope` |
| [browsershot](https://github.com/fayez-nazzal/browsershot) | macOS, Linux | `bunx playwright install chromium`, `bun run build` | `browsershot` → `dist/browsershot` |
| [termshot](https://github.com/fayez-nazzal/termshot) | macOS (Ghostty, screencapture) | `bun run build` | `termshot` → `dist/termshot` |
| [nag](https://github.com/fayez-nazzal/nag) | macOS (launchd) | none; registers nag's launchd agent | `nag` → `src/cli.ts` |
| [next-step](https://github.com/fayez-nazzal/next-step) | macOS, Linux | `bun run build` (nx) | `next-step` → `dist/next-step` |
| [chrome-domain-tab-saver](https://github.com/fayez-nazzal/chrome-domain-tab-saver) | macOS, Linux | none | none: a Chrome extension |

Every build first runs `bun install` (`--frozen-lockfile` when the repository
tracks `bun.lock`).

## Change the list

Edit `GITHUB_TOOLS` in `tools.conf`. One entry per tool:
`name | platforms | build | links`. The comments in the file describe each
field. `GITHUB_TOOLS_DIR`, `GITHUB_TOOLS_BIN`, `GITHUB_TOOLS_OWNER`, and the
cron schedule `GITHUB_TOOLS_CRON` are plain variables next to it. Run
`my-setup-tools` to apply a change now; `my-setup-tools list` shows what
applies to this machine. Removing an entry stops syncing it; its checkout and
link stay until you delete them.

## Trusted commits

A sync builds and links only commits signed by an owner key you enrolled on this
machine. There is no trust on first use: the first clone is verified like any
other update. Nothing is trusted because GitHub says so: the `web-flow` key and
the API's `verified` flag are never consulted, and no key is imported
automatically.

Enrolled keys live outside the repository in `~/.config/my-setup/tool-trust/`:

| File | Contents |
| --- | --- |
| `allowed_signers` | SSH keys, one per line: `my-setup-owner namespaces="git" <public key>` |
| `owner-keys.asc` | OpenPGP public keys, ASCII-armored |

Both files must be regular files, not symlinks, owned by your user with mode
`0600`; the directory must be a real directory with mode `0700`. Anything else
fails closed. Only public keys belong here; never copy a private key in.

To enroll a key:

1. Confirm its fingerprint from a source you control: `ssh-keygen -lf <key>.pub`
   for SSH, `gpg --show-keys --fingerprint <key>.asc` for OpenPGP.
2. Add the SSH public key to `allowed_signers` as `my-setup-owner namespaces="git" <public key>`.
   Export the OpenPGP public key with `gpg --armor --export <fingerprint>` and append it to `owner-keys.asc`.
3. Set the modes: `chmod 700 ~/.config/my-setup/tool-trust`, then `chmod 600` on both files.

Verification uses git itself. SSH-signed commits are checked with
`ssh-keygen` against `allowed_signers` alone. OpenPGP-signed commits are checked
in a throwaway keyring that holds only `owner-keys.asc`; your `~/.gnupg` is never
read. Each commit needs exactly one signature. An unsigned commit, or an
unsupported signature format, fails that tool with `has no single SSH or OpenPGP
signature`. A signature from a key that is not enrolled fails it with `not signed
by an enrolled owner key`. Nothing is built or linked for either, and the
previous binary stays in place. A missing or unsafe trust file fails the same
way, with `trust material`.

What signatures do not cover:

- Ignored files, `node_modules`, and local edits made after checkout.
- The toolchain (bun, node, compilers). A signed change can still pull in
  malicious dependencies; signatures do not vet them.
- A compromised owner key. Remove the key from the trust files to revoke it.
- The TPM, AeroSpace, Alacritty, zsh-abbr, and fzf source builds. Each is a
  separate trust surface and is not covered by this gate.

## What a sync does

For each tool that applies to this platform:

1. **Clone** it when `~/tools/<name>` is missing. The default branch is fetched into a private staging directory, its tip is verified, and only then is it checked out into place. A checkout found in the earlier location `~/repos/tools/<name>` is moved instead of re-cloned, and its HEAD is verified like any other.
2. **Update** it with `git fetch` plus a fast-forward merge, but only when the checkout is on its default branch, has no uncommitted changes to tracked files, and has no local commits. The fetched tip must verify before it is merged. Otherwise the line says why it was skipped, and the tool is neither built nor linked, so work in progress is never touched.
3. **Build** only when the commit or the build command changed since the last successful build, or a linked file is missing. HEAD must pass the trust check first on every sync (see [Trusted commits](#trusted-commits)). The last good build is recorded in `.git/my-setup-build`, so an unchanged tool costs one `git fetch` and one signature check. A failed build leaves the previous binary in place and is retried on the next sync.
4. **Link** each command into `~/.local/bin`. Existing symlinks are retargeted;
   a real file in the way is left alone and reported.

One failing tool does not stop the others; the exit status is non-zero when
any failed. Only one sync runs at a time (`~/.local/state/my-setup/tools.lock`;
a lock left by a dead process is reclaimed).

Output is one line per tool, for example:

```text
tmuxscope: updated 1c97cb7..338bad0, built
termshot: unchanged; uncommitted changes: not updated
```

## Auto-update (cron)

The installer choice **GitHub tools auto-update** adds one crontab line, marked
`# my-setup:github-tools`:

```text
17 9,21 * * * '/path/to/my-setup/tools/sync.sh' sync --log # my-setup:github-tools
```

`--log` appends to `~/.local/state/my-setup/tools-sync.log` and trims it to
the last 1000 lines once it passes 2000. The script adds `~/.bun/bin`,
`~/.volta/bin`, `~/.local/bin`, and the Homebrew prefixes to cron's minimal
`PATH`. When Node is missing, `bun install` lifecycle scripts run on Bun
through a `node` shim.

```sh
my-setup-tools cron status    # print the installed line
my-setup-tools cron install   # add or update it (rewrites only the marked line)
my-setup-tools cron remove
```

cron skips runs while the machine sleeps, so a sync missed overnight happens at
the next scheduled time. On Linux without `crontab`, the installer installs the
`cron` package through APT and enables the service.

## Per-tool notes

- **nag**: `nag install` would also append a `nag banner` block to `~/.zshrc`,
  which is this repository's tracked `zsh/.zshrc` and already runs the banner
  from `zsh/.config/zsh/rc.d/40-hooks.zsh`. The build step therefore registers
  only the launchd agent (`~/Library/LaunchAgents/io.fayez.nag.plist`), through
  nag's own installer, with the stable `bun` path on `PATH` instead of
  Homebrew's versioned Cellar path.
- **chrome-domain-tab-saver**: load `~/tools/chrome-domain-tab-saver` once
  per Chrome profile (`chrome://extensions` → Developer mode → Load
  unpacked). Synced updates apply when Chrome restarts or you click Reload on
  the extension.
- **browsershot**: Playwright's Chromium is downloaded to Playwright's shared
  cache. On Linux, browser system libraries may need
  `bunx playwright install --with-deps chromium` (sudo) once.
