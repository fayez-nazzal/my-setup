#!/bin/sh
# Keeps Alacritty's palette in step with the system light/dark appearance.
#
#   theme-sync.sh [apply]   write ~/.config/alacritty/theme.toml (default)
#   theme-sync.sh current   print "dark" or "light" and exit
#   theme-sync.sh watch     Linux only: apply on every GNOME settings change
#   theme-sync.sh install   register the macOS LaunchAgent or Linux user
#                           service that keeps the theme current, then apply
#
# Alacritty imports ~/.config/alacritty/theme.toml and live-reloads it when the
# file is replaced. Writes are atomic and skipped when the palette is unchanged.
set -eu

PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PATH

here=$(cd "$(dirname "$0")" && pwd -P)
self="$here/$(basename "$0")"
theme_dir="$HOME/.config/alacritty"
theme_file="$theme_dir/theme.toml"

# Prints "dark" or "light".
# macOS: AppleInterfaceStyle exists only in dark mode.
# GNOME: color-scheme prefer-dark/prefer-light decides; when it is 'default',
# the GTK theme name decides ("*dark*" means dark). Missing gsettings means light.
system_mode() {
  case "$(uname -s)" in
    Darwin)
      if [ "$(/usr/bin/defaults read -g AppleInterfaceStyle 2>/dev/null || true)" = Dark ]; then
        echo dark
      else
        echo light
      fi
      ;;
    Linux)
      scheme=$(gsettings get org.gnome.desktop.interface color-scheme 2>/dev/null || true)
      case "$scheme" in
        *prefer-dark*) echo dark; return 0 ;;
        *prefer-light*) echo light; return 0 ;;
      esac
      gtk=$(gsettings get org.gnome.desktop.interface gtk-theme 2>/dev/null || true)
      case "$gtk" in
        *[Dd]ark*) echo dark ;;
        *) echo light ;;
      esac
      ;;
    *)
      echo "theme-sync: unsupported platform $(uname -s)" >&2
      exit 1
      ;;
  esac
}

apply() {
  mode=$(system_mode)
  src="$here/themes/$mode.toml"
  mkdir -p "$theme_dir"
  if [ -f "$theme_file" ] && cmp -s "$src" "$theme_file"; then
    return 0
  fi
  if [ -e "$theme_file" ] && ! grep -q '^# .*palette selected by theme-sync.sh ' "$theme_file"; then
    echo "theme-sync: refusing to overwrite unmanaged $theme_file" >&2
    exit 1
  fi
  tmp=$(mktemp "$theme_dir/.theme.XXXXXX")
  if cp "$src" "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$theme_file"; then
    return 0
  fi
  rm -f "$tmp"
  echo "theme-sync: could not write $theme_file" >&2
  exit 1
}

watch() {
  if [ "$(uname -s)" != Linux ]; then
    echo "theme-sync: watch is Linux only; macOS uses the LaunchAgent from install" >&2
    exit 2
  fi
  apply
  gsettings monitor org.gnome.desktop.interface | while IFS= read -r _event; do
    apply
  done
}

install() {
  case "$(uname -s)" in
    Darwin)
      agents="$HOME/Library/LaunchAgents"
      label=com.my-setup.alacritty-theme
      plist="$agents/$label.plist"
      mkdir -p "$agents"
      if [ -e "$plist" ] && ! grep -q 'Managed by my-setup alacritty theme-sync' "$plist"; then
        echo "theme-sync: refusing to overwrite unmanaged $plist" >&2
        exit 1
      fi
      apply
      # WatchPaths reacts when cfprefsd writes the preference file. The file
      # is flushed asynchronously, so StartInterval re-applies as a backstop.
      # apply is a no-op when nothing changed.
      cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!-- Managed by my-setup alacritty theme-sync -->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$self</string>
    <string>apply</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>$HOME/Library/Preferences/.GlobalPreferences.plist</string>
  </array>
  <key>StartInterval</key>
  <integer>30</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
EOF
      uid=$(id -u)
      launchctl bootout "gui/$uid/$label" 2>/dev/null || true
      launchctl bootstrap "gui/$uid" "$plist"
      apply
      ;;
    Linux)
      command -v gsettings >/dev/null 2>&1 || { echo "theme-sync: gsettings is required" >&2; exit 1; }
      command -v systemctl >/dev/null 2>&1 || { echo "theme-sync: systemctl --user is required" >&2; exit 1; }
      units="$HOME/.config/systemd/user"
      unit="my-setup-alacritty-theme.service"
      mkdir -p "$units"
      if [ -e "$units/$unit" ] && ! grep -q '^# Managed by my-setup alacritty theme-sync$' "$units/$unit"; then
        echo "theme-sync: refusing to overwrite unmanaged $units/$unit" >&2
        exit 1
      fi
      apply
      cat > "$units/$unit" <<EOF
# Managed by my-setup alacritty theme-sync
[Unit]
Description=Follow the GNOME appearance in Alacritty

[Service]
ExecStart=/bin/sh $self watch
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
      systemctl --user daemon-reload
      systemctl --user enable --now "$unit"
      apply
      ;;
    *)
      echo "theme-sync: unsupported platform $(uname -s)" >&2
      exit 1
      ;;
  esac
}

case "${1:-apply}" in
  apply) apply ;;
  current) system_mode ;;
  watch) watch ;;
  install) install ;;
  *)
    echo "usage: theme-sync.sh [apply|current|watch|install]" >&2
    exit 2
    ;;
esac
