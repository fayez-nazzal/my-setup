alias gl='git log --graph --oneline'

ffn() {
  find . -type f -not -path './.git/*' -iname "*$1*"
}

ffc() {
  command -v rg >/dev/null 2>&1 || return 127
  rg -i -l -F --hidden --glob '!.git' "$1" .
}

# Make sure OMP (and anything it spawns) runs under zsh even when $SHELL
# defaults to something else (e.g. a display manager session or systemd
# unit with $SHELL unset/bash). Resolve zsh dynamically instead of
# hardcoding /usr/bin/zsh or /bin/zsh, so this works on both platforms.
# Perplexity's web-search key stays in 1Password and is loaded only when
# the omp command is invoked; failed lookups leave OMP's normal fallbacks
omp() {
  if [[ -z "${PERPLEXITY_API_KEY:-}" ]] && command -v op >/dev/null 2>&1; then
    local perplexity_key
    perplexity_key="$(op read "op://Personal/Perplexity Web Search/password" --no-newline 2>/dev/null)" || perplexity_key=""
    [[ -n "$perplexity_key" ]] && export PERPLEXITY_API_KEY="$perplexity_key"
  fi
  SHELL="$(command -v zsh)" command omp "$@"
}

# Linux-only power controls (systemd). No-op on macOS.
command -v systemctl >/dev/null 2>&1 && alias shutdown='systemctl poweroff'
command -v systemctl >/dev/null 2>&1 && alias restart='systemctl reboot'

# Machine-local audio helpers (see ../../../../bin/README.md) — only
# defined when the scripts are actually on PATH.
if command -v noise-cancel >/dev/null 2>&1; then
  alias ncon='noise-cancel on'
  alias ncoff='noise-cancel off'
  alias ncstatus='noise-cancel status'
fi

if command -v audio-control >/dev/null 2>&1; then
  alias speaker-up='audio-control speaker up'
  alias speaker-down='audio-control speaker down'
  alias speaker-mute='audio-control speaker mute'
  alias speaker-volume='audio-control speaker volume'
  alias mic-up='audio-control mic up'
  alias mic-down='audio-control mic down'
  alias mic-mute='audio-control mic mute'
  alias mic-volume='audio-control mic volume'
  alias audio-help='audio-control help'
fi
