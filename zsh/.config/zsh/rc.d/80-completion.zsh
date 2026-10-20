# User-local completions (the installer's AeroSpace source build puts _aerospace here).
[[ -d "$HOME/.local/share/zsh/site-functions" ]] && fpath=("$HOME/.local/share/zsh/site-functions" $fpath)
[[ -d "$HOME/.zsh/completions" ]] && fpath=("$HOME/.zsh/completions" $fpath)
autoload -Uz compinit && compinit -C 2>/dev/null
