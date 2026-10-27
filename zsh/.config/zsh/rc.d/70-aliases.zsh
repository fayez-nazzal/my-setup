alias gl='git log --graph --oneline'
alias glo="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset'"
alias gco='git checkout'

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
#
# The launcher runs in a subshell so credentials never reach the calling shell.
# It removes inherited OP_* variables (personal session, account, Connect, and
# any ambient service-account token), then exports only the scoped OMP
# service-account token read from the OS credential store. The Perplexity key
# is passed to OMP's command environment alone. Deny rules in
# .omp/agent/config.yml reduce what OMP's bash tool may run with that token;
# they are not a sandbox.
omp() (
  unsetopt xtrace verbose
  local name
  for name in ${(k)parameters}; do
    [[ $name == OP_* ]] && unset "$name"
  done
  local zsh_path token perplexity_key perplexity_err
  zsh_path="$(command -v zsh)"
  if ! command -v op >/dev/null 2>&1; then
    print -u2 -- "omp: the 1Password CLI (op) is required for OMP's credentials; install it (see the OMP credentials section of zsh/README.md)."
    return 1
  fi
  if ! token="$(_keychain_secret my-setup.omp.service-account)"; then
    print -u2 -- "omp: OMP did not start: the scoped service-account token is unavailable or empty. Personal 1Password sign-in is not used as a fallback."
    return 1
  fi
  export OP_SERVICE_ACCOUNT_TOKEN="$token"
  if ! op whoami >/dev/null; then
    print -u2 -- "omp: OMP did not start: the stored service-account token cannot authenticate. Repair it using bin/omp-setup-credentials (macOS); see zsh/README.md. Unlocking Keychain does not repair an invalid token."
    return 1
  fi
  # Read once at launch. An inherited PERPLEXITY_API_KEY is never used.
  perplexity_key="$(op read "op://OMP/Perplexity Web Search/password" --no-newline 2>/dev/null)" || perplexity_key=""
  if [[ -z "$perplexity_key" ]]; then
    # Re-run only on failure, capturing op's stderr (never its stdout, which is the key).
    perplexity_err="$(op read "op://OMP/Perplexity Web Search/password" --no-newline 2>&1 >/dev/null)"
    print -u2 -- "omp: Perplexity web search key unavailable from the OMP vault (${perplexity_err:-op printed no error}); web_search will report it. OMP still starts."
  fi
  if command -v omp-hide-aws-skills >/dev/null 2>&1; then
    omp-hide-aws-skills || return $?
  fi
  if [[ -n "$perplexity_key" ]]; then
    PERPLEXITY_API_KEY="$perplexity_key" SHELL="$zsh_path" command omp "$@"
  else
    unset PERPLEXITY_API_KEY
    SHELL="$zsh_path" command omp "$@"
  fi
)
