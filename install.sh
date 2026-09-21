#!/usr/bin/env bash
# Bootstrap installer for this repo. Idempotent — safe to re-run.
#
# What this deliberately does NOT do:
#   - invent a personal identity, hardware ID, or secret on your behalf
#   - overwrite a pre-existing real file/directory without backing it up
#   - blindly apply one machine's hardware-specific values to another
# Anything it can't safely automate is printed in the "needs your
# attention" summary at the end, with a pointer to the relevant README.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR=""
NEEDS_ATTENTION=()

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
note() { NEEDS_ATTENTION+=("$*"); }

# Ensures $BACKUP_DIR exists (created lazily, once per run).
backup_dir() {
  if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="$HOME/.dotfiles-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    log "Backing up any replaced files to $BACKUP_DIR"
  fi
}

rel_home() { printf '%s' "${1#"$HOME"/}"; }

# backup_existing DST — if DST is a real file/dir, copy it into
# $BACKUP_DIR and remove it (returns 0). If DST is already a symlink,
# just remove it (returns 1, nothing worth backing up). If DST doesn't
# exist, no-op (returns 1).
backup_existing() {
  dst=$1
  if [ -L "$dst" ]; then
    rm -f "$dst"
    return 1
  fi
  if [ -e "$dst" ]; then
    backup_dir
    rel=$(rel_home "$dst")
    safe_name=${rel//\//__}
    cp -a "$dst" "$BACKUP_DIR/$safe_name"
    rm -rf "$dst"
    note "Backed up existing $dst to $BACKUP_DIR/$safe_name"
    return 0
  fi
  return 1
}

# link SRC DST — symlink DST -> SRC, backing up a pre-existing real
# file/directory first. No-op if DST already points at SRC.
link() {
  src=$1
  dst=$2
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    return 0
  fi
  mkdir -p "$(dirname "$dst")"
  backup_existing "$dst" || true
  ln -sfn "$src" "$dst"
  log "linked $dst -> $src"
}

scan_backup_for_secrets() {
  [ -n "$BACKUP_DIR" ] || return 0
  found=$(grep -rEl \
    "sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|BEGIN (RSA|OPENSSH|PGP) PRIVATE KEY|AKIA[0-9A-Z]{16}" \
    "$BACKUP_DIR" 2>/dev/null || true)
  if [ -n "$found" ]; then
    note "Possible plaintext secret(s) found in your backed-up files — move each to the untracked local file its README names, then rotate the secret:"
    while IFS= read -r f; do note "    $f"; done <<EOF
$found
EOF
  fi
}

# ---------------------------------------------------------------------------
# Cross-platform pieces
# ---------------------------------------------------------------------------

install_zsh() {
  log "zsh: symlinking dotfiles"
  had_real_config=false
  if [ -e "$HOME/.config/zsh" ] && [ ! -L "$HOME/.config/zsh" ]; then
    had_real_config=true
  fi

  link "$REPO_DIR/zsh/.zshenv"     "$HOME/.zshenv"
  link "$REPO_DIR/zsh/.zprofile"   "$HOME/.zprofile"
  link "$REPO_DIR/zsh/.zshrc"      "$HOME/.zshrc"
  link "$REPO_DIR/zsh/.config/zsh" "$HOME/.config/zsh"

  if [ "$had_real_config" = true ]; then
    backed_up="$BACKUP_DIR/.config__zsh"
    if [ -f "$backed_up/local.zsh" ] && [ ! -e "$REPO_DIR/zsh/.config/zsh/local.zsh" ]; then
      cp "$backed_up/local.zsh" "$REPO_DIR/zsh/.config/zsh/local.zsh"
      chmod 600 "$REPO_DIR/zsh/.config/zsh/local.zsh"
      note "Migrated your previous ~/.config/zsh/local.zsh into the repo's (git-ignored) zsh/.config/zsh/local.zsh."
    fi
    note "Your previous ~/.config/zsh was backed up to $backed_up — check it for anything else worth keeping."
  fi
  note "Review your backed-up .zshrc/.zshenv/.zprofile (if any) for custom lines worth keeping — add them under zsh/.config/zsh/rc.d/ or profile.d/, or zsh/.config/zsh/local.zsh for anything machine-local. Never put a secret in a tracked rc.d file."
}

install_git() {
  log "git: symlinking portable config"
  had_real_gitconfig=false
  if [ -e "$HOME/.gitconfig" ] && [ ! -L "$HOME/.gitconfig" ]; then
    had_real_gitconfig=true
  fi

  link "$REPO_DIR/git/.gitconfig" "$HOME/.gitconfig"

  if [ "$had_real_gitconfig" = true ] && [ ! -e "$HOME/.gitconfig.local" ]; then
    backed_up="$BACKUP_DIR/.gitconfig"
    if [ -f "$backed_up" ]; then
      cp "$backed_up" "$HOME/.gitconfig.local"
      chmod 600 "$HOME/.gitconfig.local"
      note "Migrated your previous ~/.gitconfig (identity/signing key/etc.) to ~/.gitconfig.local — review it (git/README.md)."
    fi
  fi
  if [ ! -e "$HOME/.gitconfig.local" ]; then
    note "No ~/.gitconfig.local yet — create one with your name/email (and signing key, if you sign commits). Not auto-created: this script won't invent your identity. See git/README.md."
  fi
}

install_tmux() {
  log "tmux: symlinking config"
  link "$REPO_DIR/.tmux.conf" "$HOME/.tmux.conf"

  if ! command -v tmux >/dev/null 2>&1; then
    note "tmux isn't installed — install it, then re-run this script."
    return 0
  fi

  if [ ! -d "$HOME/.tmux/plugins/tpm" ]; then
    log "tmux: cloning TPM"
    mkdir -p "$HOME/.tmux/plugins"
    git clone --quiet https://github.com/tmux-plugins/tpm "$HOME/.tmux/plugins/tpm"
  fi

  log "tmux: installing TPM plugins (isolated tmux server — never touches a real running session)"

  scopes_before=""
  if [ -f "$REPO_DIR/tmux/tmux-scopes.conf" ]; then
    scopes_before=$(cat "$REPO_DIR/tmux/tmux-scopes.conf")
  fi

  real_tmux=$(command -v tmux)
  bootstrap_socket="my_setup_bootstrap_$$"
  scratch_scopes=$(mktemp)
  wrapper_dir=$(mktemp -d)
  # Every `tmux` call TPM's installer makes internally (it spawns panes to
  # run each plugin's install script) must land on our throwaway server,
  # never the user's real one — force that via a PATH-shadowing shim
  # instead of relying on install_plugins accepting a -L flag itself.
  cat > "$wrapper_dir/tmux" <<EOF
#!/bin/sh
exec "$real_tmux" -L "$bootstrap_socket" "\$@"
EOF
  chmod +x "$wrapper_dir/tmux"

  TMUXSCOPE_CONFIG="$scratch_scopes" PATH="$wrapper_dir:$PATH" \
    "$real_tmux" -L "$bootstrap_socket" -f "$HOME/.tmux.conf" new-session -d -s bootstrap -x 80 -y 24 2>/dev/null || true
  TMUXSCOPE_CONFIG="$scratch_scopes" PATH="$wrapper_dir:$PATH" \
    "$HOME/.tmux/plugins/tpm/bin/install_plugins" >/dev/null 2>&1 \
    || warn "tmux: TPM plugin install failed — run ~/.tmux/plugins/tpm/bin/install_plugins inside a real tmux session"
  sleep 1
  "$real_tmux" -L "$bootstrap_socket" kill-server 2>/dev/null || true
  rm -f "${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)/$bootstrap_socket" 2>/dev/null || true
  rm -rf "$wrapper_dir" "$scratch_scopes"

  if [ -f "$REPO_DIR/tmux/tmux-scopes.conf" ] && [ "$(cat "$REPO_DIR/tmux/tmux-scopes.conf")" != "$scopes_before" ]; then
    printf '%s\n' "$scopes_before" > "$REPO_DIR/tmux/tmux-scopes.conf"
    warn "tmuxscope rewrote the tracked tmux/tmux-scopes.conf during plugin install despite isolation — reverted it automatically. Please report this upstream if it recurs."
  fi

  # Now that plugins are installed, reload config into a real running
  # session too (if one exists) so it picks up the plugin option changes.
  if tmux list-sessions >/dev/null 2>&1; then
    tmux source-file "$HOME/.tmux.conf" 2>/dev/null || true
  fi

  if command -v bun >/dev/null 2>&1; then
    if ! command -v tmuxscope >/dev/null 2>&1; then
      log "tmux: building tmuxscope (no published package — see tmux/README.md)"
      mkdir -p "$HOME/repos/tools"
      if [ ! -d "$HOME/repos/tools/tmuxscope" ]; then
        git clone --quiet https://github.com/REDACTED-REDACTED/tmuxscope.git "$HOME/repos/tools/tmuxscope"
      fi
      (cd "$HOME/repos/tools/tmuxscope" && bun install --silent && bun run build && bun link) \
        || warn "tmuxscope build failed — see tmux/README.md"
    fi
  else
    note "tmuxscope needs Bun (not found) — install Bun, then re-run this script (see tmux/README.md)."
  fi

  link "$REPO_DIR/tmux/tmux-scopes.conf" "$HOME/.config/tmux-scopes.conf"
  note "tmux-scopes.conf's scope patterns are one person's project layout — edit them for yours (tmux/README.md)."
}

install_zsh_abbr() {
  if command -v zsh-abbr >/dev/null 2>&1 || [ -r "$HOME/.config/zsh-abbr/zsh-abbr.zsh" ]; then
    return 0
  fi
  if command -v brew >/dev/null 2>&1; then
    log "zsh-abbr: installing via Homebrew"
    brew install olets/tap/zsh-abbr || warn "zsh-abbr: brew install failed"
  else
    log "zsh-abbr: cloning (no Homebrew needed)"
    git clone --quiet https://github.com/olets/zsh-abbr --recurse-submodules \
      --single-branch --branch main --depth 1 "$HOME/.config/zsh-abbr" \
      || warn "zsh-abbr: clone failed"
  fi
}

install_omp() {
  log "omp: symlinking config only — never the whole state directory"
  mkdir -p "$HOME/.omp/agent"
  link "$REPO_DIR/.omp/agent/config.yml" "$HOME/.omp/agent/config.yml"
  link "$REPO_DIR/.omp/agent/models.yml" "$HOME/.omp/agent/models.yml"
  link "$REPO_DIR/.omp/agent/mcp.json"   "$HOME/.omp/agent/mcp.json"
  link "$REPO_DIR/.omp/agent/skills"     "$HOME/.omp/agent/skills"
  note "~/.omp/agent/ also holds live runtime state (databases, sessions, caches) once the agent has run. This script only ever touches config.yml/models.yml/mcp.json/skills — never symlink the whole agent/ directory."
}

# ---------------------------------------------------------------------------
# Recommended CLI tools (starship/zoxide/fzf/bat/eza), Homebrew where
# available, sudo-free upstream installers/binaries otherwise.
# ---------------------------------------------------------------------------

install_bat_binary() {
  arch=$(uname -m)
  case "$arch" in
    x86_64) target="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
    *) note "bat: unsupported architecture ($arch) for automatic binary install — install manually."; return 0 ;;
  esac
  log "bat: installing upstream release binary (no sudo)"
  work=$(mktemp -d)
  ver=$(curl -sSL https://api.github.com/repos/sharkdp/bat/releases/latest | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  if curl -sSL -o "$work/bat.tar.gz" "https://github.com/sharkdp/bat/releases/download/${ver}/bat-${ver}-${target}.tar.gz" \
    && tar xzf "$work/bat.tar.gz" -C "$work"; then
    cp "$work"/bat-*/bat "$HOME/.local/bin/bat"
    chmod +x "$HOME/.local/bin/bat"
  else
    warn "bat: download/extract failed"
  fi
  rm -rf "$work"
}

install_eza_binary() {
  arch=$(uname -m)
  case "$arch" in
    x86_64) target="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
    *) note "eza: unsupported architecture ($arch) for automatic binary install — install manually."; return 0 ;;
  esac
  log "eza: installing upstream release binary (no sudo)"
  work=$(mktemp -d)
  ver=$(curl -sSL https://api.github.com/repos/eza-community/eza/releases/latest | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  if curl -sSL -o "$work/eza.tar.gz" "https://github.com/eza-community/eza/releases/download/${ver}/eza_${target}.tar.gz" \
    && tar xzf "$work/eza.tar.gz" -C "$work"; then
    cp "$work/eza" "$HOME/.local/bin/eza"
    chmod +x "$HOME/.local/bin/eza"
  else
    warn "eza: download/extract failed"
  fi
  rm -rf "$work"
}

install_recommended_tools() {
  mkdir -p "$HOME/.local/bin"

  if command -v brew >/dev/null 2>&1; then
    log "Recommended tools: installing via Homebrew"
    brew install starship zoxide fzf bat eza fd ripgrep thefuck || warn "brew install had failures"
    return 0
  fi

  if ! command -v starship >/dev/null 2>&1; then
    log "starship: installing (user-local, no sudo)"
    curl -sS https://starship.rs/install.sh | sh -s -- -y -b "$HOME/.local/bin" || warn "starship install failed"
  fi

  if ! command -v zoxide >/dev/null 2>&1; then
    log "zoxide: installing (user-local, no sudo)"
    curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh || warn "zoxide install failed"
  fi

  if ! command -v fzf >/dev/null 2>&1; then
    log "fzf: installing (user-local, no sudo)"
    if [ ! -d "$HOME/.fzf" ]; then
      git clone --quiet --depth 1 https://github.com/junegunn/fzf.git "$HOME/.fzf"
    fi
    "$HOME/.fzf/install" --bin --no-update-rc >/dev/null || warn "fzf install failed"
    ln -sfn "$HOME/.fzf/bin/fzf" "$HOME/.local/bin/fzf"
  fi

  command -v bat >/dev/null 2>&1 || install_bat_binary
  command -v eza >/dev/null 2>&1 || install_eza_binary

  if command -v apt-get >/dev/null 2>&1 && ! command -v fd >/dev/null 2>&1 && ! command -v fdfind >/dev/null 2>&1; then
    note "fd not found — 'sudo apt install fd-find' (installs as fdfind; symlink ~/.local/bin/fd to it if you want the plain name)."
  fi
  if ! command -v thefuck >/dev/null 2>&1; then
    note "thefuck not installed — needs 'sudo apt install thefuck' (or pipx), which this script won't run without your password."
  fi
}

# ---------------------------------------------------------------------------
# OS-specific window manager stacks
# ---------------------------------------------------------------------------

install_macos_desktop() {
  log "macOS: AeroSpace"
  if command -v brew >/dev/null 2>&1; then
    brew install --cask aerospace || warn "brew install aerospace failed"
  else
    note "Homebrew not found — install AeroSpace yourself: https://github.com/nikitabobko/AeroSpace"
  fi
  link "$REPO_DIR/.aerospace.toml" "$HOME/.aerospace.toml"
  note ".aerospace.toml references machine-specific helper scripts under ~/.config/aerospace/*.sh (ghostty.sh, finder-single.sh, etc.) this repo doesn't ship, and app bundle IDs for one person's apps — adjust for yours (README.md's AeroSpace section)."
}

install_linux_desktop() {
  log "Linux: i3 + keyd + picom + Alacritty + PipeWire"

  pkgs="i3 i3-wm i3lock i3status python3 dex feh picom rofi xss-lock
    network-manager network-manager-gnome pulseaudio-utils keyd alacritty
    pipewire pipewire-audio-client-libraries wireplumber jq"

  if command -v apt-get >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      log "Installing apt packages (passwordless sudo available)"
      # shellcheck disable=SC2086
      sudo apt-get install -y $pkgs || warn "apt-get install had failures — check output above"
    else
      note "No passwordless sudo available to this script — install these yourself: sudo apt install $(echo $pkgs)"
    fi
  else
    note "No apt-get found — install for your distro: $(echo $pkgs)"
  fi

  mkdir -p "$HOME/.config/i3" "$HOME/.config/i3status" "$HOME/.config/picom" "$HOME/.config/alacritty" "$HOME/.local/bin"
  link "$REPO_DIR/i3/config" "$HOME/.config/i3/config"
  link "$REPO_DIR/i3/i3status/status.py" "$HOME/.config/i3status/status.py"
  link "$REPO_DIR/picom/picom.conf" "$HOME/.config/picom/picom.conf"
  link "$REPO_DIR/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"
  for f in alacritty audio-control noise-cancel; do
    link "$REPO_DIR/bin/$f" "$HOME/.local/bin/$f"
  done

  if sudo -n true 2>/dev/null; then
    log "keyd: installing system-wide config (needs sudo)"
    sudo mkdir -p /etc/keyd
    sudo ln -sfn "$REPO_DIR/keyd/default.conf" /etc/keyd/default.conf
    sudo ln -sfn "$REPO_DIR/keyd/apple-magic-keyboard.conf" /etc/keyd/apple-magic-keyboard.conf
    sudo systemctl enable --now keyd 2>/dev/null || warn "keyd: couldn't enable the service — check 'systemctl status keyd'"
  else
    note "keyd needs root — run the sudo ln/systemctl commands in keyd/README.md yourself."
  fi

  note "i3/config bakes in this machine's real xrandr output names and app window-class assign rules — edit them for your hardware/apps (i3/README.md)."
  note "keyd/apple-magic-keyboard.conf only matters if you have that exact keyboard (keyd/README.md)."
  note "pipewire/ (RNNoise filter + Firefox mic routing) is optional, hardware/browser-specific, and not installed by this script — see pipewire/README.md before adopting it."
}

# ---------------------------------------------------------------------------
main() {
  log "Bootstrapping from $REPO_DIR"

  install_zsh
  install_git
  install_tmux
  install_zsh_abbr
  install_omp

  case "$(uname -s)" in
    Darwin)
      install_macos_desktop
      install_recommended_tools
      ;;
    Linux)
      install_linux_desktop
      install_recommended_tools
      ;;
    *)
      warn "Unrecognized OS ($(uname -s)) — skipped the window manager and recommended-tool installs. zsh/tmux/git/omp still ran."
      ;;
  esac

  scan_backup_for_secrets

  echo
  log "Done. Needs your attention:"
  if [ "${#NEEDS_ATTENTION[@]}" -eq 0 ]; then
    echo "  (nothing)"
  else
    for item in "${NEEDS_ATTENTION[@]}"; do
      printf '  - %s\n' "$item"
    done
  fi
  if [ -n "$BACKUP_DIR" ]; then
    echo
    log "Pre-existing files were backed up to: $BACKUP_DIR"
  fi
}

main "$@"
