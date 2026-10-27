# Read one generic-password secret from the OS credential store and print only
# its value. Used by the omp and claude launchers at session start.
#   macOS: the item is created with -T "", so macOS prompts on each read.
#   Linux: Secret Service via secret-tool; the keyring's unlock prompt applies.
# Returns non-zero when the item is missing, empty, or the store is unusable.
# The service name is the only argument; the value never goes into argv.
_keychain_secret() {
  local service="$1" value
  case "$(uname -s)" in
    Darwin)
      value="$(/usr/bin/security find-generic-password -a "$(id -un)" -s "$service" -w 2>/dev/null)" || return 1
      ;;
    Linux)
      if ! command -v secret-tool >/dev/null 2>&1; then
        print -u2 -- "secret-tool is required to read $service; install libsecret-tools and keep a Secret Service keyring unlocked."
        return 1
      fi
      value="$(secret-tool lookup service "$service" account "$(id -un)" 2>/dev/null)" || return 1
      ;;
    *)
      print -u2 -- "unsupported platform for the credential store ($service)."
      return 1
      ;;
  esac
  [[ -n "$value" ]] || return 1
  print -r -- "$value"
}
