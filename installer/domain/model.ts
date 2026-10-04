export type ComponentId =
  | "zsh-config" | "git-config" | "tmux-config" | "omp-config" | "tmuxscope-config" | "alacritty-config" | "styleguard"
  | "aerospace-config" | "gnome-config" | "keyd-config" | "amphetamine-config"
  | "zsh" | "git" | "tmux" | "tmux-plugins" | "github-tools" | "github-tools-cron" | "zsh-abbr" | "starship" | "zoxide" | "fzf" | "bat" | "eza" | "fd" | "ripgrep" | "thefuck" | "killport" | "volta" | "node-lts" | "alacritty" | "nerd-font"
  | "1password-cli" | "1password" | "gh" | "obsidian" | "1password-signin" | "gh-auth" | "git-signing"
  | "aerospace" | "google-chrome" | "orbstack" | "amphetamine" | "linux-desktop" | "keyd" | "gnome-apply" | "macos-defaults";
export type Platform = "darwin" | "linux";
export interface ComponentDefinition { id: ComponentId; label: string; description: string; group: "Configuration" | "OS configuration" | "Software" | "Accounts and signing" | "OS software/state"; platforms: readonly Platform[]; requires: readonly ComponentId[] }
export interface ComponentAvailability { enabled: boolean; reason?: string; installed: boolean; outdated?: boolean }
export interface SelectionState { cursor: number; selected: ReadonlySet<ComponentId> }
export interface ComponentResult { id: ComponentId; status: "changed" | "unchanged" | "blocked" | "failed"; attention: readonly string[] }
