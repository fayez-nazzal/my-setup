# Start Claude Code with its own credentials. Independent of omp: it reads only
# my-setup.claude.excalidraw, never the OMP service-account token and never `op`.
# The key is read once, when the session starts (one Keychain prompt on macOS),
# and exported to the claude process only. The Excalidraw MCP headersHelper
# (~/.local/bin/claude-excalidraw-header) reads it from that variable.
claude() (
  unsetopt xtrace verbose
  local key
  if ! key="$(_keychain_secret my-setup.claude.excalidraw)"; then
    print -u2 -- "claude: the Excalidraw key is unavailable from the credential store, so the Excalidraw MCP server will fail to authenticate. Claude still starts. See the Claude section of zsh/README.md."
    unset MY_SETUP_CLAUDE_EXCALIDRAW_KEY
    command claude "$@"
    return
  fi
  MY_SETUP_CLAUDE_EXCALIDRAW_KEY="$key" command claude "$@"
)
