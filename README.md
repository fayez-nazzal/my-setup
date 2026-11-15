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
Most configs are symlinked, so editing this repo changes your machine. Run
`~/my-setup/install.sh --help` for the accepted flags.

## Platforms and prerequisites

- **macOS:** Full Xcode is required, not just Command Line Tools. The installer
  checks developer selection, license, first launch, SDK, and compiler before
  Homebrew, Bun, or tool installs. Missing Xcode uses the prompted App Store
  install-and-retry flow. Homebrew is offered if absent.
- **Permissions:** Needed grants come before affected operations: Automation
  for System Events/Amphetamine, app-data access or Full Disk Access for
  Amphetamine preferences, and Accessibility for AeroSpace. Denial blocks
  that operation. Some grants require restarting the terminal and retrying.
- **Debian/Ubuntu:** amd64 and arm64 use signed APT repositories,
  signature-checked vendor downloads, and SHA-256-pinned release archives
  (`installer/domain/download-pins.ts`). Headless systems skip desktop-only
  choices but retain shell and developer tools.

The installer does not manage passwords, API tokens, or account sign-ins.
Provide credentials explicitly through machine-local environment variables.

## Everyday behavior

- **AWS and Java:** Select AWS CLI v2, Amazon Corretto 21, and Corretto 21
  `JAVA_HOME`. AWS credentials stay unchanged; `aws configure sso` is optional.
  The login snippet at `zsh/.config/zsh/profile.d/30-java-home.zsh` selects
  Corretto 21, exports `JAVA_HOME`, and puts its `bin` first on `PATH`.
  Open a new login shell afterward.
- **Terminal:** Alacritty settles on one default window sharing a marked tmux
  session, even after tmuxscope renames it. Explicit `alacritty -e CMD` windows
  stay independent. Existing windows keep their shells; finish their work and
  close them before adopting this policy. The installer does not close your
  work.
- **Signing and secrets:** Setup does not provision signing keys, authenticate
  GitHub CLI, or load credentials into applications. Identity belongs in
  untracked `~/.gitconfig.local`; provide required credentials explicitly in
  each machine-local session. Revoke exposed tokens and rotate other secrets.
- **OMP and writing:** Only selected configuration, extensions, skills, and
  the writer definition are linked—not the whole agent folder with sessions
  and history. The role-backed writer handles bounded writing without tools.
  OpenRouter models are selectable with
  `omp --model openrouter/google/gemini-4-argon` or
  `omp --model openrouter/deepseek/deepseek-v4.1-flash-1017`; its API key is
  read from `OPENROUTER_API_KEY` when provided by the current session.
  Existing model-role assignments are unchanged. `~/.omp/agent/models.yml`
  links to `.omp/agent/models.yml` here.
- **RTK:** The `rtk` software choice installs the pinned, digest-checked
  release into `~/.bun/bin/rtk`. Its OMP extension lives in the linked
  extensions directory and rewrites plain bash commands to compact output.
  `/rtk off` disables OMP's extra RTK guidance only; use an absolute binary
  path or set `RTK_DISABLED=1` in OMP's environment when raw output is
  required.
- **OMP theme:** The installer links the two high-contrast themes and the
  `system-theme` extension. The extension watches Alacritty's generated
  appearance file and switches running interactive OMP sessions after it
  changes; restart OMP once to load it. Without that file, OMP uses its
  configured dark/light automatic detection instead. See
  [`alacritty/README.md`](alacritty/README.md) for the system appearance
  service. The custom palettes improve default text, status and syntax
  contrast; application-supplied colors can still override them.
- **Excalidraw+ MCP:** OMP uses `.omp/agent/mcp.json`, linked on this machine
  to `~/.omp/agent/mcp.json`. Provide `EXCALIDRAW_API_KEY` explicitly to its
  session. Claude Code's optional helper uses the separate
  `MY_SETUP_CLAUDE_EXCALIDRAW_KEY` variable. Neither configuration stores a
  key. The installer does not configure Claude Code.

## Details

[Shell](zsh/README.md) · [Git](git/README.md) · [tmux](tmux/README.md) ·
[Alacritty](alacritty/README.md) · [Amphetamine](amphetamine/README.md) ·
[GNOME](gnome/README.md) · [keyd](keyd/README.md) ·
[Tools](tools/README.md) · [Scripts](bin/README.md)

AI agents: read [AGENTS.md](AGENTS.md) first.
