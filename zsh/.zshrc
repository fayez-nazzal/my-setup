source "$HOME/.config/zsh/lib/load.zsh"
export JAVA_HOME="$HOME/.local/opt/corretto-21"
export PATH="$HOME/.local/bin:$JAVA_HOME/bin:$PATH"
export PATH="/home/fayez/.local/bin:$PATH"
export PODMAN_COMPOSE_PROVIDER="$HOME/.local/bin/podman-compose"
zrc_load_dir "$HOME/.config/zsh/rc.d"
alias docker=podman
