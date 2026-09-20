if [[ -o interactive && -o zle && $TERM != dumb ]] && command -v histago >/dev/null 2>&1 && command -v fzf >/dev/null 2>&1; then
  fzf-history-timeago() {
    local selected_cmd
    selected_cmd=$(histago | fzf --ansi --layout=reverse --height=40% --border | sed 's/^[^|]*| //')
    [[ -n "$selected_cmd" ]] && LBUFFER="$selected_cmd"
    zle reset-prompt
  }

  zle -N fzf-history-timeago
  bindkey '^R' fzf-history-timeago
  bindkey -e
fi
