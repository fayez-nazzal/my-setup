typeset -gA __ZRC_LOADED

zrc_source() {
  local file=${1:A}
  [[ -r $file ]] || return 0
  (( ${+__ZRC_LOADED[$file]} )) && return 0
  __ZRC_LOADED[$file]=1
  source "$file"
}

zrc_load_dir() {
  local file
  for file in "$1"/*.zsh(N); do
    zrc_source "$file"
  done
}
