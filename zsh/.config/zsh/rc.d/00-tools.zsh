[[ -o interactive && $TERM != dumb ]] && command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"

if command -v thefuck >/dev/null 2>&1; then
  eval "$(thefuck --alias)"
  eval "$(thefuck --alias fk)"
fi

if [[ -o interactive && -o zle && $TERM != dumb ]] && command -v fzf >/dev/null 2>&1; then
  eval "$(fzf --zsh)"
fi

if command -v fd >/dev/null 2>&1; then
  export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
  export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

  _fzf_compgen_path() { fd --hidden --exclude .git . "$1"; }
  _fzf_compgen_dir() { fd --type=d --hidden --exclude .git . "$1"; }
fi

[[ -r "$HOME/fzf-git.sh/fzf-git.sh" ]] && source "$HOME/fzf-git.sh/fzf-git.sh"

[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"

command -v bat >/dev/null 2>&1 && alias cat='bat'
command -v eza >/dev/null 2>&1 && alias ls='eza --color=always --long --git --no-filesize --icons=always --no-user --no-permissions'

# zsh-abbr: Homebrew formula on macOS, or a manual clone on Linux (no
# Homebrew required — see README for the `git clone` command).
if command -v brew >/dev/null 2>&1; then
  brew_prefix=$(brew --prefix)
  [[ -r "$brew_prefix/share/zsh-abbr/zsh-abbr.zsh" ]] && source "$brew_prefix/share/zsh-abbr/zsh-abbr.zsh"
  [[ -d "$brew_prefix/share/zsh-abbr" ]] && FPATH="$brew_prefix/share/zsh-abbr:$FPATH"
elif [[ -r "$HOME/.config/zsh-abbr/zsh-abbr.zsh" ]]; then
  source "$HOME/.config/zsh-abbr/zsh-abbr.zsh"
  FPATH="$HOME/.config/zsh-abbr:$FPATH"
fi
