export PATH="$HOME/.local/bin:$PATH"

# pnpm's official installer uses different data dirs per OS; match it so
# this works whether pnpm was installed on macOS or Linux (Debian, etc.).
case "$OSTYPE" in
  darwin*) export PNPM_HOME="$HOME/Library/pnpm" ;;
  *) export PNPM_HOME="$HOME/.local/share/pnpm" ;;
esac
[[ -d "$PNPM_HOME/bin" ]] && export PATH="$PNPM_HOME/bin:$PATH"

# BUN_INSTALL is read by bun itself (e.g. `bun upgrade`, `bun completions`)
# and by some bun-aware tools, in addition to the PATH entry below.
[[ -d "$HOME/.bun" ]] && export BUN_INSTALL="$HOME/.bun"

for tool_home in "$HOME/.bun/bin" "$HOME/.opencode/bin" "$HOME/.grok/bin" "$HOME/.jbang/bin"; do
  [[ -d $tool_home ]] && export PATH="$tool_home:$PATH"
done

[[ -r "$HOME/.config/starship.toml" ]] && export STARSHIP_CONFIG="$HOME/.config/starship.toml"
