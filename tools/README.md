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

## What a sync does

For each tool that applies to this platform:

1. **Clone** it when `~/tools/<name>` is missing. A checkout found in the
   earlier location `~/repos/tools/<name>` is moved instead of re-cloned.
2. **Update** it with `git fetch` plus a fast-forward merge, but only when the
   checkout is on its default branch, has no uncommitted changes to tracked
   files, and has no local commits. Otherwise the line says why it was skipped,
   so work in progress is never touched.
3. **Build** only when the commit or the build command changed since the last
   successful build, or a linked file is missing. The last good build is
   recorded in `.git/my-setup-build`, so an unchanged tool costs one
   `git fetch`. A failed build leaves the previous binary in place and is
   retried on the next sync.
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
