alias gl='git log --graph --oneline'

ffn() {
  find . -type f -not -path './.git/*' -iname "*$1*"
}

ffc() {
  command -v rg >/dev/null 2>&1 || return 127
  rg -i -l -F --hidden --glob '!.git' "$1" .
}
