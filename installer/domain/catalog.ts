import type { ComponentDefinition, ComponentId, Platform } from "./model";

const both: readonly Platform[] = ["darwin", "linux"];
const mac: readonly Platform[] = ["darwin"];
const linux: readonly Platform[] = ["linux"];

export const catalog: readonly ComponentDefinition[] = [
  { id: "zsh-config", label: "zsh configuration", description: "Link zsh files; existing files are backed up before replacement.", group: "Configuration", platforms: both, requires: [] },
  { id: "git-config", label: "git configuration", description: "Link portable Git defaults and preserve local identity/signing data.", group: "Configuration", platforms: both, requires: [] },
  { id: "tmux-config", label: "tmux configuration", description: "Link tmux configuration with collision-safe backups.", group: "Configuration", platforms: both, requires: [] },
  { id: "omp-config", label: "OMP configuration", description: "Link selected OMP configuration only; keep databases, sessions, and cache in place.", group: "Configuration", platforms: both, requires: [] },
  { id: "tmuxscope-config", label: "tmuxscope configuration", description: "Link tmuxscope project scopes with a collision-safe backup.", group: "Configuration", platforms: both, requires: [] },
  { id: "alacritty-config", label: "Alacritty configuration", description: "Link Alacritty settings and the tmux-backed terminal wrapper.", group: "Configuration", platforms: both, requires: [] },
  { id: "styleguard", label: "styleguard", description: "Link the repository styleguard executable.", group: "Configuration", platforms: both, requires: [] },
  { id: "aerospace-config", label: "AeroSpace configuration", description: "Link AeroSpace configuration and its Alacritty focus-or-launch helper.", group: "OS configuration", platforms: mac, requires: [] },
  { id: "gnome-config", label: "GNOME configuration", description: "Link GNOME settings and helper; this does not apply settings.", group: "OS configuration", platforms: linux, requires: [] },
  { id: "keyd-config", label: "keyd configuration", description: "Install system key remapping links; conflicting root-owned files are left untouched.", group: "OS configuration", platforms: linux, requires: [] },
  { id: "zsh", label: "zsh", description: "Install zsh only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "git", label: "git", description: "Install Git only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "tmux", label: "tmux", description: "Install tmux only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "tmux-plugins", label: "tmux plugins", description: "Install missing TPM plugins using an isolated tmux server.", group: "Software", platforms: both, requires: ["git", "tmux"] },
  { id: "tmuxscope", label: "tmuxscope", description: "Reuse a healthy checkout/build or build the documented main branch.", group: "Software", platforms: both, requires: ["git", "tmux", "zsh"] },
  { id: "zsh-abbr", label: "zsh-abbr", description: "Install through supported Homebrew or source checkout routes.", group: "Software", platforms: both, requires: ["git"] },
  { id: "starship", label: "starship", description: "Install Starship only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "zoxide", label: "zoxide", description: "Install zoxide only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "fzf", label: "fzf", description: "Install fzf only when no healthy executable is available.", group: "Software", platforms: both, requires: ["git"] },
  { id: "bat", label: "bat", description: "Install bat or recognize Debian's batcat alias.", group: "Software", platforms: both, requires: [] },
  { id: "eza", label: "eza", description: "Install eza only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "fd", label: "fd", description: "Install fd or recognize Debian's fdfind alias.", group: "Software", platforms: both, requires: [] },
  { id: "ripgrep", label: "ripgrep", description: "Install ripgrep (rg) only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "thefuck", label: "thefuck", description: "Install thefuck only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "volta", label: "Volta", description: "Install the Volta toolchain manager into ~/.volta without editing shell startup files (zsh config already exports it).", group: "Software", platforms: both, requires: [] },
  { id: "node-lts", label: "Node LTS (via Volta)", description: "Run `volta install node` to download the latest Node LTS as the default runtime.", group: "Software", platforms: both, requires: ["volta"] },
  { id: "alacritty", label: "Alacritty", description: "Install Alacritty; macOS source builds need Xcode tools, Rust, and scdoc when the cask is disabled.", group: "Software", platforms: both, requires: ["git"] },
  { id: "nerd-font", label: "Geist Mono Nerd Font", description: "Install GeistMono Nerd Font Mono for Alacritty (Regular, Bold, Italic).", group: "Software", platforms: both, requires: [] },
  { id: "aerospace", label: "AeroSpace", description: "Install AeroSpace on supported macOS, or reuse a healthy existing app.", group: "OS software/state", platforms: mac, requires: [] },
  { id: "linux-desktop", label: "Linux desktop bundle", description: "Install this setup's APT audio/network/rofi bundle; not a generic Linux desktop stack.", group: "OS software/state", platforms: linux, requires: [] },
  { id: "keyd", label: "keyd", description: "Install keyd through supported APT or stable upstream source routes.", group: "OS software/state", platforms: linux, requires: [] },
  { id: "gnome-apply", label: "Apply GNOME settings", description: "Apply managed dconf values only when they differ from the current session.", group: "OS software/state", platforms: linux, requires: [] },
];

export const configurationLinks: Partial<Record<ComponentId, readonly [string, string][]>> = {
  "zsh-config": [["zsh/.zshenv", ".zshenv"], ["zsh/.zprofile", ".zprofile"], ["zsh/.zshrc", ".zshrc"], ["zsh/.config/zsh", ".config/zsh"]],
  "git-config": [["git/.gitconfig", ".gitconfig"]],
  "tmux-config": [[".tmux.conf", ".tmux.conf"]],
  "omp-config": [[".omp/agent/config.yml", ".omp/agent/config.yml"], [".omp/agent/models.yml", ".omp/agent/models.yml"], [".omp/agent/extensions", ".omp/agent/extensions"], [".omp/agent/skills", ".omp/agent/skills"], ["bin/omp-hide-aws-skills", ".local/bin/omp-hide-aws-skills"]],
  "tmuxscope-config": [["tmux/tmux-scopes.conf", ".config/tmux-scopes.conf"]],
  "alacritty-config": [["alacritty/alacritty.toml", ".config/alacritty/alacritty.toml"], ["bin/alacritty", ".local/bin/alacritty"]],
  styleguard: [["bin/styleguard/cli.ts", ".local/bin/styleguard"]],
  "aerospace-config": [[".aerospace.toml", ".aerospace.toml"], ["bin/aerospace-alacritty", ".local/bin/aerospace-alacritty"]],
  "gnome-config": [["gnome/dconf.ini", ".config/my-setup/gnome.dconf"], ["gnome/xdg-terminals.list", ".config/xdg-terminals.list"], ["gnome/apply.sh", ".local/bin/my-setup-gnome"]],
};

export const systemConfigurationLinks: Partial<Record<ComponentId, readonly [string, string][]>> = {
  "keyd-config": [["keyd/default.conf", "/etc/keyd/default.conf"], ["keyd/apple-magic-keyboard.conf", "/etc/keyd/apple-magic-keyboard.conf"]],
};

export function definition(id: ComponentId): ComponentDefinition {
  const found = catalog.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown component ${id}`);
  return found;
}
export const configurationPrerequisites: Partial<Record<ComponentId, readonly string[]>> = {
  "zsh-config": ["zsh"],
  "git-config": ["git"],
  "tmux-config": ["tmux"],
  "omp-config": ["omp"],
  "tmuxscope-config": ["tmuxscope", "tmux"],
  "alacritty-config": ["alacritty", "tmux"],
  "aerospace-config": ["aerospace", "alacritty", "tmux"],
  "gnome-config": ["dconf", "gnome-extensions"],
  "keyd-config": ["keyd"],
};
