# Start every interactive shell signed in to 1Password CLI.
#
# `op signin` is idempotent only when the desktop-app integration is enabled;
# without it, an unconditional `eval $(op signin)` asks for the master password
# in every new terminal. So only sign in when the inherited OP_SESSION_* is
# missing or expired, and only when there is a terminal to prompt on.
if command -v op >/dev/null 2>&1 \
  && [[ -o interactive && -t 0 ]] \
  && ! op whoami >/dev/null 2>&1; then
  eval "$(op signin)"
fi
