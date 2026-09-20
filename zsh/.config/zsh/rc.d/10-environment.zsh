export PATH="$HOME/.local/bin:$PATH"
export PNPM_HOME="$HOME/Library/pnpm"
[[ -d "$PNPM_HOME/bin" ]] && export PATH="$PNPM_HOME/bin:$PATH"

for tool_home in "$HOME/.bun/bin" "$HOME/.opencode/bin" "$HOME/.grok/bin" "$HOME/.jbang/bin"; do
  [[ -d $tool_home ]] && export PATH="$tool_home:$PATH"
done

[[ -r "$HOME/.config/starship.toml" ]] && export STARSHIP_CONFIG="$HOME/.config/starship.toml"
