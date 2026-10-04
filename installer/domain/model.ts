export type ComponentId =
  | "zsh-config" | "git-config" | "tmux-config" | "omp-config" | "tmuxscope-config" | "alacritty-config" | "styleguard"
  | "aerospace-config" | "gnome-config" | "keyd-config"
  | "zsh" | "git" | "tmux" | "tmux-plugins" | "tmuxscope" | "zsh-abbr" | "starship" | "zoxide" | "fzf" | "bat" | "eza" | "fd" | "ripgrep" | "thefuck" | "volta" | "node-lts" | "alacritty" | "nerd-font"
  | "aerospace" | "linux-desktop" | "keyd" | "gnome-apply";
export type Platform = "darwin" | "linux";
export interface ComponentDefinition { id: ComponentId; label: string; description: string; group: "Configuration" | "OS configuration" | "Software" | "OS software/state"; platforms: readonly Platform[]; requires: readonly ComponentId[] }
export interface ComponentAvailability { enabled: boolean; reason?: string; installed: boolean }
export interface SelectionState { cursor: number; selected: ReadonlySet<ComponentId> }
export interface ComponentResult { id: ComponentId; status: "changed" | "unchanged" | "blocked" | "failed"; attention: readonly string[] }
