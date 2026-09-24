#!/usr/bin/env bash
# Apply the repository's GNOME settings to the current user dconf database.
# The dconf file is the source of truth; rerun this command after editing it.
set -euo pipefail

self=$(readlink -f "${BASH_SOURCE[0]}")
repo_dir=$(cd "$(dirname "$self")/.." && pwd)
config="$repo_dir/gnome/dconf.ini"

command -v dconf >/dev/null 2>&1 || {
  printf 'dconf is required to apply GNOME settings.\n' >&2
  exit 1
}

case "${1:-apply}" in
  apply)
    dconf load /org/gnome/ < "$config"
    printf 'Applied GNOME settings from %s\n' "$config"
    ;;
  dump)
    dconf dump /org/gnome/
    ;;
  *)
    printf 'Usage: %s [apply|dump]\n' "$(basename "$0")" >&2
    exit 2
    ;;
esac
