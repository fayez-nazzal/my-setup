# AGENTS.md

This repo holds one person's personal machine environment: shell startup
and interactive settings, a terminal multiplexer configuration, version
control defaults, a tiling window manager setup (one variant per OS), an
AI coding agent harness's configuration, and a handful of supporting
scripts and tool configs for that specific machine's hardware. It is
meant to be cloned onto a fresh machine and symlinked into place — some
pieces from `$HOME`, one from a system config directory that needs root.

## If you are an AI agent asked to install this repo

1. **Read [`README.md`](README.md) first.** It has the full directory
   layout, the requirements split by macOS vs. Linux/Debian, and the
   exact setup steps and rationale for every piece. This file is
   intentionally just an index — don't try to install from this file
   alone.
2. **Detect the user's OS before doing anything OS-specific.** Only
   install/symlink the macOS-specific piece on macOS, and the
   Linux-specific piece on Linux — never both, never guess.
3. **Run [`install.sh`](install.sh).** It's idempotent (safe to re-run),
   backs up any real file/directory it would otherwise overwrite, and
   prints a "needs your attention" list at the end for anything it
   couldn't safely finish on its own.
4. **Read each touched subdirectory's own `README.md`** for anything the
   script's summary flags, and before assuming a piece is fully done.
   Several pieces are one person's actual, in-use configuration rather
   than a generic template (documented per-directory) — install/symlink
   them, but don't blindly apply machine-specific values (hardware IDs,
   network/output names, window-manager rules tied to specific apps) to
   a different machine without checking they still make sense.
5. **Never invent a personal identity, hardware identifier, or secret**
   on the user's behalf. If something required isn't discoverable from
   the machine itself, ask the user instead of guessing or fabricating a
   placeholder that looks real.
6. **Never commit, print, or write a real secret into any tracked file.**
   Secrets and machine-local identity belong in the untracked file each
   relevant README names. If a tracked file or the install output ever
   surfaces something that looks like a real secret, treat it as a bug:
   remove it from tracked content, move it to the correct untracked file,
   and tell the user to rotate it.
7. **Never silently overwrite an existing configuration.** Back up first
   (the script already does this) and surface what was replaced.

Everything else — exact package names, optional vs. required tools,
version notes, and per-OS caveats — lives in `README.md` and the
`README.md` in each subdirectory. Read those before running commands by
hand; this file is a starting point, not a substitute.
