import { access, constants, readdir } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { homedir, platform as nodePlatform, arch } from "node:os";

export type Platform = "darwin" | "linux";
export interface HostFacts {
  platform: Platform;
  architecture: "x64" | "arm64";
  home: string;
  repositoryRoot: string;
  executables: ReadonlyMap<string, string>;
  packageManagers: { brew?: string; apt?: string; dpkgQuery?: string };
  gnome: { active: boolean; dbusAddress?: string; dconf?: string };
  /** False on a Linux host with no display server, desktop session, or graphical boot target (a server). */
  graphical: boolean;
  macOS: { version?: string; xcodeSelect?: string; clang?: string; make?: string };
}

export async function executableOnPath(name: string, path = process.env.PATH ?? ""): Promise<string | undefined> {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return undefined;
}

export async function discoverExecutables(names: readonly string[], path = process.env.PATH ?? ""): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  await Promise.all(names.map(async name => { const found = await executableOnPath(name, path); if (found) result.set(name, found); }));
  return result;
}

export async function inspectHost(repositoryRoot: string, env = process.env): Promise<HostFacts> {
  const rawPlatform = nodePlatform();
  if (rawPlatform !== "darwin" && rawPlatform !== "linux") throw new Error(`Unsupported operating system: ${rawPlatform}`);
  const cpu = arch();
  if (cpu !== "x64" && cpu !== "arm64") throw new Error(`Unsupported CPU architecture: ${cpu}`);
  const extra = [join(homedir(), ".volta/bin"), join(homedir(), ".local/bin"), join(homedir(), ".bun/bin"), join(homedir(), ".cargo/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin"];
  const searchPath = [...extra, env.PATH ?? ""].join(delimiter);
  const names = ["zsh", "git", "tmux", "bun", "brew", "apt-get", "dpkg-query", "apt-cache", "curl", "bash", "tar", "unzip", "fc-list", "fc-match", "fc-cache", "sw_vers", "xcode-select", "clang", "make", "tic", "gzip", "codesign", "cargo", "rustc", "rustup", "scdoc", "dconf", "gsettings", "gnome-extensions", "keyd", "keyd.rvaiya", "starship", "zoxide", "fzf", "bat", "batcat", "eza", "fd", "fdfind", "rg", "thefuck", "killport", "volta", "alacritty", "aerospace", "omp", "tmuxscope", "zsh-abbr", "sudo", "systemctl", "infocmp", "ditto", "xcodebuild", "osascript", "defaults", "killall", "crontab", "op", "gh", "obsidian", "gpg", "ssh-keygen", "pkgutil", "installer"];
  names.push("mas");
  const executables = await discoverExecutables(names, searchPath);
  if (rawPlatform === "linux") {
    for (const path of ["/home/linuxbrew/.linuxbrew/bin/brew", join(homedir(), ".linuxbrew/bin/brew")]) {
      if (!executables.has("brew")) try { await access(path, constants.X_OK); executables.set("brew", path); } catch { /* absent */ }
    }
  }
  const home = env.HOME ?? homedir();
  // A source-built Alacritty.app ships no PATH entry for its executable.
  if (!executables.has("alacritty") && rawPlatform === "darwin") {
    for (const candidate of [join(home, "Applications/Alacritty.app/Contents/MacOS/alacritty"), "/Applications/Alacritty.app/Contents/MacOS/alacritty"]) {
      try { await access(candidate, constants.X_OK); executables.set("alacritty", candidate); break; } catch { /* app absent */ }
    }
  }
  const versionResult = rawPlatform === "darwin" && executables.has("sw_vers") ? Bun.spawnSync([executables.get("sw_vers")!, "-productVersion"], { stdout: "pipe", stderr: "ignore" }) : undefined;
  const version = versionResult?.exitCode === 0 ? versionResult.stdout.toString().trim() : undefined;
  const active = rawPlatform === "linux" && /GNOME/i.test(env.XDG_CURRENT_DESKTOP ?? "");
  const graphical = rawPlatform === "darwin" || await linuxGraphical(env, executables.get("systemctl"));
  return {
    platform: rawPlatform, architecture: cpu, home: env.HOME ?? homedir(), repositoryRoot, executables,
    packageManagers: { ...(executables.has("brew") ? { brew: executables.get("brew") } : {}), ...(executables.has("apt-get") ? { apt: executables.get("apt-get") } : {}), ...(executables.has("dpkg-query") ? { dpkgQuery: executables.get("dpkg-query") } : {}) },
    gnome: { active, ...(env.DBUS_SESSION_BUS_ADDRESS ? { dbusAddress: env.DBUS_SESSION_BUS_ADDRESS } : {}), ...(executables.has("dconf") ? { dconf: executables.get("dconf") } : {}) },
    graphical,
    macOS: { version, ...(executables.has("xcode-select") ? { xcodeSelect: executables.get("xcode-select") } : {}), ...(executables.has("clang") ? { clang: executables.get("clang") } : {}), ...(executables.has("make") ? { make: executables.get("make") } : {}) },
  };
}

/**
 * A Linux host counts as graphical when this session has a display, it boots into graphical.target,
 * or it ships an X11/Wayland session (a desktop machine reached over SSH). Servers have none of these.
 */
async function linuxGraphical(env: NodeJS.ProcessEnv, systemctl: string | undefined): Promise<boolean> {
  if (env.DISPLAY || env.WAYLAND_DISPLAY || env.XDG_CURRENT_DESKTOP) return true;
  if (systemctl) {
    const target = Bun.spawnSync([systemctl, "get-default"], { stdout: "pipe", stderr: "ignore" });
    if (target.exitCode === 0 && target.stdout.toString().trim() === "graphical.target") return true;
  }
  for (const directory of ["/usr/share/xsessions", "/usr/share/wayland-sessions"]) {
    if ((await readdir(directory).catch(() => [] as string[])).some(name => name.endsWith(".desktop"))) return true;
  }
  return false;
}

export function resolveExecutable(facts: HostFacts, name: string): string | undefined { return facts.executables.get(name); }
export function executableDirectory(path: string): string { return dirname(path); }
