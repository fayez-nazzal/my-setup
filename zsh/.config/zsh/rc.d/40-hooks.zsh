if command -v wt >/dev/null 2>&1; then
  eval "$(wt config shell init zsh)"
fi

if command -v nag >/dev/null 2>&1; then
  nag banner
fi

if command -v tmuxscope >/dev/null 2>&1; then
  eval "$(tmuxscope hook zsh)"
fi
