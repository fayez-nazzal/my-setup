#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
usage() { printf 'Usage: %s [--help] [--dry-run]\n' "$0"; }
case "${1:-}" in --help) usage; exit 0 ;; --dry-run|"") ;; *) printf 'Unsupported argument: %s\n' "$1" >&2; usage >&2; exit 2 ;; esac
DRY_RUN="${1:-}"
os="$(uname -s)"; arch="$(uname -m)"
case "$os" in Darwin|Linux) ;; *) printf 'Unsupported operating system: %s\n' "$os" >&2; exit 1 ;; esac
case "$arch" in x86_64|arm64|aarch64) ;; *) printf 'Unsupported CPU architecture: %s\n' "$arch" >&2; exit 1 ;; esac
if [ "$(id -u)" -eq 0 ]; then printf 'Do not run the installer as root.\n' >&2; exit 1; fi
if [ ! -t 0 ] || [ ! -t 1 ]; then printf 'Interactive installer requires a terminal on stdin and stdout.\n' >&2; exit 1; fi
prepend_existing() { for candidate in "$HOME/.local/bin" "$HOME/.bun/bin" "$HOME/.cargo/bin" /opt/homebrew/bin /usr/local/bin /home/linuxbrew/.linuxbrew/bin; do [ ! -d "$candidate" ] || PATH="$candidate:$PATH"; done; }
prepend_existing; export PATH
if [ "$DRY_RUN" != --dry-run ] && [ "$os" = Darwin ] && ! command -v brew >/dev/null 2>&1; then
  printf 'Homebrew not found. Install Homebrew? [y/N] '; read -r answer || answer=n
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    if ! command -v curl >/dev/null 2>&1; then printf 'Homebrew bootstrap requires curl; Homebrew-dependent choices will remain unavailable.\n' >&2
    else
      tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
      if curl -fL --retry 2 https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$tmp"; then
        if /bin/bash "$tmp"; then prepend_existing; export PATH
        else printf 'Homebrew installation failed; continuing with non-Homebrew routes.\n' >&2; fi
      else printf 'Homebrew download failed; continuing with non-Homebrew routes.\n' >&2; fi
      rm -f "$tmp"; trap - EXIT
    fi
  fi
fi
bun_path="$(command -v bun || true)"
if [ -z "$bun_path" ] && command -v brew >/dev/null 2>&1 && brew list --formula --versions bun >/dev/null 2>&1; then
  prefix="$(brew --prefix bun 2>/dev/null || true)"
  if [ -n "$prefix" ] && [ -x "$prefix/bin/bun" ]; then bun_path="$prefix/bin/bun"
  else printf 'Homebrew reports Bun installed but its executable is missing; repair the Homebrew Bun installation.\n' >&2; exit 1; fi
fi
bun_ok=false
if [ -n "$bun_path" ]; then version="$("$bun_path" --version 2>/dev/null || true)"; if [[ "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]] && { (( BASH_REMATCH[1] > 1 )) || (( BASH_REMATCH[1] == 1 && BASH_REMATCH[2] >= 3 )); }; then bun_ok=true; fi; fi
if [ "$bun_ok" != true ]; then
  if [ "$DRY_RUN" = --dry-run ]; then printf 'Bun >=1.3.0 is required for --dry-run; bootstrap is disabled.\n' >&2; exit 1; fi
  printf 'Bun >=1.3.0 is required. Install or upgrade Bun? [y/N] '; read -r answer || answer=n
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then printf 'Install Bun >=1.3.0, then rerun %s.\n' "$0" >&2; exit 1; fi
  if command -v brew >/dev/null 2>&1; then
    if [ -n "$bun_path" ] && brew list --formula --versions bun >/dev/null 2>&1; then brew upgrade oven-sh/bun/bun || { printf 'Consented Bun upgrade failed.\n' >&2; exit 1; }
    else brew install oven-sh/bun/bun || { printf 'Bun installation failed.\n' >&2; exit 1; }; fi
  else
    for prerequisite in curl bash unzip; do command -v "$prerequisite" >/dev/null 2>&1 || { printf 'Upstream Bun installer requires %s.\n' "$prerequisite" >&2; exit 1; }; done
    tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
    curl -fL --retry 2 https://bun.com/install -o "$tmp" || { printf 'Bun installer download failed.\n' >&2; exit 1; }
    /bin/bash "$tmp" || { printf 'Bun installation failed.\n' >&2; exit 1; }
    rm -f "$tmp"; trap - EXIT
  fi
  prepend_existing; export PATH; bun_path="$(command -v bun || true)"; [ -n "$bun_path" ] || bun_path="$HOME/.bun/bin/bun"
  [ -x "$bun_path" ] || { printf 'Bun installation did not provide an executable.\n' >&2; exit 1; }
fi
lock="$REPO_DIR/installer/bun.lock"; hash_file="$REPO_DIR/installer/.bootstrap-lock-hash"
lock_hash=""
if [ -f "$lock" ]; then lock_hash="$(cd "$REPO_DIR/installer" && "$bun_path" -e 'import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; process.stdout.write(createHash("sha256").update(readFileSync("bun.lock")).digest("hex"))')"; fi
import_ok=false
if [ -n "$lock_hash" ] && [ -d "$REPO_DIR/installer/node_modules/@opentui/core" ] && (cd "$REPO_DIR/installer" && "$bun_path" -e 'await import("@opentui/core")' >/dev/null 2>&1); then import_ok=true; fi
if [ "$import_ok" != true ] || [ ! -f "$hash_file" ] || [ "$(cat "$hash_file" 2>/dev/null || true)" != "$lock_hash" ]; then
  if [ "$DRY_RUN" = --dry-run ]; then printf 'Installer dependencies are missing or stale; --dry-run does not bootstrap them. Run %s normally first.\n' "$0" >&2; exit 1; fi
  printf 'Installer dependencies are missing, broken, or out of date. Run Bun dependency setup? [y/N] '; read -r answer || answer=n
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then printf 'Run bun install in %s/installer, then rerun.\n' "$REPO_DIR" >&2; exit 1; fi
  if [ -f "$lock" ]; then (cd "$REPO_DIR/installer" && "$bun_path" install --frozen-lockfile) || { printf 'Installer dependency installation failed.\n' >&2; exit 1; }
  else (cd "$REPO_DIR/installer" && "$bun_path" install) || { printf 'Installer dependency installation failed.\n' >&2; exit 1; }; fi
  (cd "$REPO_DIR/installer" && "$bun_path" -e 'await import("@opentui/core")') >/dev/null 2>&1 || { printf 'OpenTUI import failed after dependency setup.\n' >&2; exit 1; }
  lock_hash="$(cd "$REPO_DIR/installer" && "$bun_path" -e 'import { createHash } from "node:crypto"; import { readFileSync } from "node:fs"; process.stdout.write(createHash("sha256").update(readFileSync("bun.lock")).digest("hex"))')"
  printf '%s\n' "$lock_hash" > "$hash_file"
fi
exec "$bun_path" run "$REPO_DIR/installer/cli.ts" ${DRY_RUN:+"$DRY_RUN"}
