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

omp() (
  if command -v omp-hide-aws-skills >/dev/null 2>&1; then
    omp-hide-aws-skills || return $?
  fi
  command omp "$@"
)
