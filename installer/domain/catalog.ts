import type { ComponentDefinition, ComponentId, Platform } from "./model";

const both: readonly Platform[] = ["darwin", "linux"];
const mac: readonly Platform[] = ["darwin"];
const linux: readonly Platform[] = ["linux"];

export const catalog: readonly ComponentDefinition[] = [
  { id: "xcode", label: "Full Xcode setup", description: "Verify full Xcode, developer selection, license, first-launch components, and the macOS SDK before macOS tools.", group: "Prerequisites", platforms: mac, requires: [] },
  { id: "zsh-config", label: "zsh configuration", description: "Link zsh files; existing files are backed up before replacement.", group: "Configuration", platforms: both, requires: [] },
  { id: "java-home", label: "Corretto 21 JAVA_HOME", description: "Set JAVA_HOME and Java's PATH in the managed zsh login environment; verify the selected Corretto JDK.", group: "Configuration", platforms: both, requires: ["corretto21", "zsh-config"] },
  { id: "git-config", label: "git configuration", description: "Link portable Git defaults and preserve local identity/signing data.", group: "Configuration", platforms: both, requires: [] },
  { id: "tmux-config", label: "tmux configuration", description: "Link tmux configuration with collision-safe backups.", group: "Configuration", platforms: both, requires: [] },
  { id: "omp-config", label: "OMP configuration", description: "Link selected OMP configuration only; keep databases, sessions, and cache in place.", group: "Configuration", platforms: both, requires: [] },
  { id: "tmuxscope-config", label: "tmuxscope configuration", description: "Link tmuxscope project scopes with a collision-safe backup.", group: "Configuration", platforms: both, requires: [] },
  { id: "alacritty-config", label: "Alacritty configuration", description: "Link Alacritty settings and its guarded shell: one default window in the shared tmux session.", group: "Configuration", platforms: both, requires: [] },
  { id: "styleguard", label: "styleguard", description: "Link the repository styleguard executable.", group: "Configuration", platforms: both, requires: [] },
  { id: "aerospace-config", label: "AeroSpace configuration", description: "Link AeroSpace configuration and its Alacritty focus-or-launch helper.", group: "OS configuration", platforms: mac, requires: [] },
  { id: "amphetamine-config", label: "Amphetamine configuration", description: "Keep the Mac awake: apply amphetamine/amphetamine.plist (session at launch and on wake, no Dock icon), open Amphetamine at login, and start a session.", group: "OS configuration", platforms: mac, requires: [] },
  { id: "gnome-config", label: "GNOME configuration", description: "Link GNOME settings and helper; this does not apply settings.", group: "OS configuration", platforms: linux, requires: [] },
  { id: "keyd-config", label: "keyd configuration", description: "Install system key remapping links; conflicting root-owned files are left untouched.", group: "OS configuration", platforms: linux, requires: [] },
  { id: "zsh", label: "zsh", description: "Install zsh when missing; upgrade it when Homebrew reports it outdated.", group: "Software", platforms: both, requires: [] },
  { id: "git", label: "git", description: "Install Git when missing; upgrade it when Homebrew reports it outdated.", group: "Software", platforms: both, requires: [] },
  { id: "tmux", label: "tmux", description: "Install tmux when missing; upgrade it when Homebrew reports it outdated.", group: "Software", platforms: both, requires: [] },
  { id: "tmux-plugins", label: "tmux plugins", description: "Install missing TPM plugins using an isolated tmux server.", group: "Software", platforms: both, requires: ["git", "tmux"] },
  { id: "github-tools", label: "GitHub tools (~/tools)", description: "Clone, fast-forward, build, and link the tools listed in tools/tools.conf (tmuxscope, browsershot, termshot, nag, next-step, chrome-domain-tab-saver).", group: "Software", platforms: both, requires: ["git"] },
  { id: "github-tools-cron", label: "GitHub tools auto-update", description: "Install the crontab entry that pulls and rebuilds changed GitHub tools twice a day; installs cron on Linux when missing.", group: "Software", platforms: both, requires: ["github-tools"] },
  { id: "zsh-abbr", label: "zsh-abbr", description: "Install through supported Homebrew or source checkout routes.", group: "Software", platforms: both, requires: ["git"] },
  { id: "starship", label: "starship", description: "Install Starship only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "zoxide", label: "zoxide", description: "Install zoxide only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "fzf", label: "fzf", description: "Install fzf only when no healthy executable is available.", group: "Software", platforms: both, requires: ["git"] },
  { id: "bat", label: "bat", description: "Install bat or recognize Debian's batcat alias.", group: "Software", platforms: both, requires: [] },
  { id: "eza", label: "eza", description: "Install eza only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "fd", label: "fd", description: "Install fd or recognize Debian's fdfind alias.", group: "Software", platforms: both, requires: [] },
  { id: "ripgrep", label: "ripgrep", description: "Install ripgrep (rg) only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "thefuck", label: "thefuck", description: "Install thefuck only when no healthy executable is available.", group: "Software", platforms: both, requires: [] },
  { id: "killport", label: "killport", description: "Install killport (free a port by killing its processes) via Homebrew, APT, or its latest Linux release archive.", group: "Software", platforms: both, requires: [] },
  { id: "volta", label: "Volta", description: "Install the Volta toolchain manager into ~/.volta without editing shell startup files (zsh config already exports it).", group: "Software", platforms: both, requires: [] },
  { id: "node-lts", label: "Node LTS (via Volta)", description: "Run `volta install node` to download the latest Node LTS as the default runtime.", group: "Software", platforms: both, requires: ["volta"] },
  { id: "aws-cli", label: "AWS CLI v2", description: "Install and verify AWS CLI v2 for this OS and CPU; AWS credentials remain machine-local.", group: "Software", platforms: both, requires: [] },
  { id: "corretto21", label: "Amazon Corretto 21", description: "Install Amazon's Corretto JDK 21; verify both the Java version and Corretto vendor.", group: "Software", platforms: both, requires: [] },
  { id: "alacritty", label: "Alacritty", description: "Install Alacritty; on macOS build the latest stable release (Xcode tools, Rust, scdoc) and rebuild when a newer one ships.", group: "Software", platforms: both, requires: ["git"] },
  { id: "nerd-font", label: "Geist Mono Nerd Font", description: "Install GeistMono Nerd Font Mono for Alacritty (Regular, Bold, Italic).", group: "Software", platforms: both, requires: [] },
  { id: "1password-cli", label: "1Password CLI", description: "Install op: Homebrew cask or AgileBits' signed package on macOS; 1Password's signed APT repository or signed archive (~/.local/bin) on Linux amd64/arm64.", group: "Software", platforms: both, requires: [] },
  { id: "1password", label: "1Password", description: "Install the 1Password app (Homebrew cask on macOS; signed APT repository on Linux amd64, signed tarball into /opt/1Password on arm64). Desktop only.", group: "Software", platforms: both, requires: [] },
  { id: "gh", label: "GitHub CLI", description: "Install gh: Homebrew, GitHub's signed APT repository, or its digest-checked release into ~/.local/bin.", group: "Software", platforms: both, requires: [] },
  { id: "obsidian", label: "Obsidian", description: "Install Obsidian (Homebrew cask on macOS; digest-checked .deb on Linux amd64, release tarball into /opt/Obsidian on arm64). Desktop only.", group: "Software", platforms: both, requires: [] },
  { id: "1password-signin", label: "1Password CLI sign-in", description: "Install op when missing, then connect it: the app's CLI integration where 1Password runs, otherwise op account add (address, email, Secret Key, password) and op signin.", group: "Accounts and signing", platforms: both, requires: ["1password-cli"] },
  { id: "gh-auth", label: "GitHub CLI sign-in", description: "Run gh auth login (device code) with the admin:ssh_signing_key and write:gpg_key scopes; HTTPS Git credentials through gh.", group: "Accounts and signing", platforms: both, requires: ["gh"] },
  { id: "git-signing", label: "Git commit signing (1Password)", description: "Keep or choose GPG (key from this keyring or 1Password “GPG Secret Key”, passphrase “GPG Key Password”) or SSH (1Password “SSH Key”); register it on GitHub and verify a test commit.", group: "Accounts and signing", platforms: both, requires: ["git", "1password-cli"] },
  { id: "aerospace", label: "AeroSpace", description: "Build AeroSpace from main with full Xcode (rebuilt when main moves); otherwise install the Homebrew cask.", group: "OS software/state", platforms: mac, requires: [] },
  { id: "google-chrome", label: "Google Chrome", description: "Install Google Chrome with the Homebrew cask.", group: "OS software/state", platforms: mac, requires: [] },
  { id: "orbstack", label: "OrbStack", description: "Install OrbStack (Docker and Linux machines) with the Homebrew cask.", group: "OS software/state", platforms: mac, requires: [] },
  { id: "amphetamine", label: "Amphetamine", description: "Install Amphetamine from the App Store with Homebrew's mas; sign in to the App Store first.", group: "OS software/state", platforms: mac, requires: [] },
  { id: "linux-desktop", label: "Linux desktop bundle", description: "Install this setup's APT audio/network/rofi bundle; not a generic Linux desktop stack.", group: "OS software/state", platforms: linux, requires: [] },
  { id: "keyd", label: "keyd", description: "Install keyd through supported APT or stable upstream source routes.", group: "OS software/state", platforms: linux, requires: [] },
  { id: "gnome-apply", label: "Apply GNOME settings", description: "Apply managed dconf values only when they differ from the current session.", group: "OS software/state", platforms: linux, requires: [] },
  { id: "macos-defaults", label: "Apply AeroSpace macOS settings", description: "Write AeroSpace's recommended macOS defaults and the auto-hidden, unanimated Dock; only differing values change.", group: "OS software/state", platforms: mac, requires: [] },
];

export const configurationLinks: Partial<Record<ComponentId, readonly [string, string][]>> = {
  "zsh-config": [["zsh/.zshenv", ".zshenv"], ["zsh/.zprofile", ".zprofile"], ["zsh/.zshrc", ".zshrc"], ["zsh/.config/zsh", ".config/zsh"]],
  "git-config": [["git/.gitconfig", ".gitconfig"]],
  "tmux-config": [[".tmux.conf", ".tmux.conf"]],
  "omp-config": [[".omp/agent/config.yml", ".omp/agent/config.yml"], [".omp/agent/models.yml", ".omp/agent/models.yml"], [".omp/agent/extensions", ".omp/agent/extensions"], [".omp/agent/skills", ".omp/agent/skills"], [".omp/agent/agents/writer.md", ".omp/agent/agents/writer.md"], ["bin/omp-hide-aws-skills", ".local/bin/omp-hide-aws-skills"]],
  "tmuxscope-config": [["tmux/tmux-scopes.conf", ".config/tmux-scopes.conf"]],
  "alacritty-config": [["alacritty/alacritty.toml", ".config/alacritty/alacritty.toml"], ["bin/my-setup-alacritty-shell", ".local/bin/my-setup-alacritty-shell"]],
  styleguard: [["bin/styleguard/cli.ts", ".local/bin/styleguard"]],
  "aerospace-config": [[".aerospace.toml", ".aerospace.toml"], ["bin/aerospace-alacritty", ".local/bin/aerospace-alacritty"]],
  "gnome-config": [["gnome/dconf.ini", ".config/my-setup/gnome.dconf"], ["gnome/xdg-terminals.list", ".config/xdg-terminals.list"], ["gnome/apply.sh", ".local/bin/my-setup-gnome"]],
};

/** Links earlier versions created for files since removed from the repository; deleted only while they still point at that source. */
export const retiredConfigurationLinks: Partial<Record<ComponentId, readonly [string, string][]>> = {
  "alacritty-config": [["bin/alacritty", ".local/bin/alacritty"]],
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
/** Components that must run before a selected component when both are selected, beyond `requires`. */
export const runAfter: Partial<Record<ComponentId, readonly ComponentId[]>> = {
  // The tmuxscope binary comes from the GitHub tools sync; link its scopes after it is in place.
  "tmuxscope-config": ["github-tools"],
  // App integration and op-ssh-sign come from the app; signing registers the key through a signed-in gh.
  "1password-signin": ["1password"],
  "gh-auth": ["1password"],
  "git-signing": ["git-config", "1password", "1password-signin", "gh-auth"],
  "amphetamine-config": ["amphetamine"],
};
/** Components that need a graphical session; a headless Linux server disables them. */
export const desktopOnly: ReadonlySet<ComponentId> = new Set<ComponentId>(["alacritty-config", "gnome-config", "keyd-config", "alacritty", "nerd-font", "1password", "obsidian", "linux-desktop", "keyd", "gnome-apply"]);
