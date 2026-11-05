source "$HOME/.config/zsh/lib/load.zsh"
zrc_load_dir "$HOME/.config/zsh/rc.d"

eval "$(direnv hook zsh)"

# opencode
export PATH=/Users/fayez/.opencode/bin:$PATH
export PI_NOTIFICATIONS=on


if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi
