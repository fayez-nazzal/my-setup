alias gl='git log --graph --oneline'

# Reuse the dedicated editor window when running nvim without arguments in tmux.
nvim() {
  if [[ $# -eq 0 && -n "${TMUX:-}" ]] && tmux select-window -t '=nvim' 2>/dev/null; then
    return
  fi
  command nvim "$@"
}

ffn() {
  find . -type f -not -path './.git/*' -iname "*$1*"
}

ffc() {
  if command -v rg >/dev/null 2>&1; then
    rg -i -l -F --hidden --glob '!.git' "$1" .
  else
    find . -type d -name .git -prune -o -type f -exec grep -i -l -F -- "$1" {} +
  fi
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
  if command -v omp-hide-aws-skills >/dev/null 2>&1; then
    omp-hide-aws-skills || return $?
  fi
  SHELL="$(command -v zsh)" command omp "$@"
}
