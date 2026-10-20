source "$HOME/.config/zsh/lib/load.zsh"
zrc_load_dir "$HOME/.config/zsh/rc.d"

# direnv: per-directory environment (pins JAVA_HOME in taxclever repos)
eval "$(direnv hook zsh)"
