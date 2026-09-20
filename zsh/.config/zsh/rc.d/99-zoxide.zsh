if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh)"
  [[ -o interactive ]] && alias cd='z'
fi
