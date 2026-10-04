# Alacritty

The default shell entrypoint opens one Alacritty window backed by a shared
tmux session, regardless of launch route: Dock, Spotlight, `open -a Alacritty`,
AeroSpace's Alt+Enter, GNOME's shortcut or `xdg-terminal-exec`, or `alacritty`
from a shell. A private advisory lock serializes default shells. The first
keeps the lock while attached to tmux; a concurrent default launch activates
Alacritty on macOS and exits its otherwise-empty shell, allowing that
temporary window to close. This lock is not a process-count heuristic.
`alacritty -e CMD` replaces the configured shell, so explicit commands retain
their own windows and do not participate.

The configured login zsh sources
`~/.local/bin/my-setup-alacritty-shell` (linked from `bin/` by the installer),
so the tmux server inherits the full login environment. The helper locks
`~/.cache/my-setup/alacritty-default.lock` and requires its directory and file
to be owned by the current user with private permissions. After checking
ownership, it makes an existing lock directory private (mode `700`): the
AeroSpace source installer can also create this shared cache directory.
The installer creates new shared cache directories with mode `700` as well.
This repairs older installs where mode `755` caused the default shell to
exit immediately. Symlinked directories and foreign ownership remain errors.
It uses the zsh `zsh/system` advisory `flock` builtin; if that module is
unavailable or the lock cannot be safely obtained, the helper reports the
problem and refuses to launch another default session. tmux is looked up on `$PATH`, then in
`/opt/homebrew/bin`, `/usr/local/bin`, `/home/linuxbrew/.linuxbrew/bin`, and
`/usr/bin`. Without tmux the window prints a notice and starts a plain login
zsh.

The default tmux session is found by its `@my_setup_default_alacritty` session
option, not its name. This remains stable when tmuxscope renames the session
to a directory scope; on first use the helper adopts the historical `main`
session if present, otherwise it creates and marks one. Switch sessions
inside tmux (`prefix s`).

The AeroSpace helper already focuses the existing Alacritty window before
launching the app when none exists. On macOS, concurrent default shell
launches activate Alacritty using `open -a`, without an Automation grant. On Linux the extra shell exits
without killing a window; explicit `-e` commands are never closed by this
guard.

## Install

Select **Alacritty configuration** in `./install.sh`. It links the settings
and shell helper, and removes the old `~/.local/bin/alacritty` wrapper only
while it still points at this repository. Existing windows keep their old
shell; finish their work and close them before using the new default-window
policy. The installer never closes your existing work.

By hand:

```sh
mkdir -p "$HOME/.config/alacritty" "$HOME/.local/bin"
ln -sfn "$HOME/my-setup/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"
ln -sfn "$HOME/my-setup/bin/my-setup-alacritty-shell" "$HOME/.local/bin/my-setup-alacritty-shell"
```

Requires:

- **Alacritty 0.14 or newer.** Older releases read the shell from the
  top-level `shell` key and ignore `terminal.shell`, so their windows open a
  plain shell. The installer flags such a version (for example Ubuntu 24.04's
  APT package, 0.13.2).
- **tmux** — the `tmux` installer choice.
- `/bin/zsh` (hardcoded as `terminal.shell.program`) — adjust if zsh
  lives elsewhere on your system (`command -v zsh`), or if you haven't
  switched to zsh yet (see [`../zsh`](../zsh)).
- The **GeistMono Nerd Font Mono** family — select `Geist Mono Nerd Font` in
  the interactive installer to install its Regular, Bold, and Italic faces.
  On macOS the installer also checks that the font service has activated
  them and registers them for your user when it hasn't (a `~/Library/Fonts`
  created after login is not picked up on its own). Without the font,
  Alacritty still starts but warns `Unable to load specified font … falling
  back to Menlo`; open a new Alacritty window after the installer runs.
- The `Insert`-key bindings assume [`keyd`](../keyd/README.md)'s
  `[command:C]` layer is installed and emitting `Ctrl+Insert`/`Shift+Insert`
  for Cmd+C/Cmd+V — without keyd, those bindings are simply unreachable
  from a physical keyboard (harmless, not an error) and normal
  Ctrl+Shift+C/V still work for copy/paste.
