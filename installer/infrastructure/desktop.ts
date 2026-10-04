import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { systemConfigurationLinks } from "../domain/catalog";
import type { RecipeContext, ToolResult } from "./tools";

function result(id: string, status: ToolResult["status"], ...attention: string[]): ToolResult {
  return { id, status, attention };
}
function executable(c: RecipeContext, name: string): string | undefined {
  return c.host.executables.get(name);
}

export async function installKeyd(c: RecipeContext): Promise<ToolResult> {
  if (c.host.platform !== "linux") return result("keyd", "blocked", "keyd is supported only on Linux.");
  const keyd = executable(c, "keyd") ?? executable(c, "keyd.rvaiya");
  const devices = await readFile("/proc/bus/input/devices", "utf8").catch(() => undefined);
  const hasAppleKeyboard = devices !== undefined && /(?:Vendor=004c|Vendor=05ac).*?Product=029c|Product=029c.*?Vendor=(?:004c|05ac)/is.test(devices);
  const systemLinks = systemConfigurationLinks["keyd-config"] ?? [];
  const appleMapping = systemLinks.find(([source]) => source.includes("apple"));
  const appleConfig = appleMapping ? join(c.repoRoot, appleMapping[0]) : "";
  const appleDestination = appleMapping?.[1] ?? "";
  const links: Array<[string, string]> = systemLinks
    .filter(([source]) => hasAppleKeyboard || !source.includes("apple"))
    .map(([source, destination]) => [join(c.repoRoot, source), destination]);
  const ensureSystemLink = async (source: string, destination: string): Promise<boolean | ToolResult> => {
    const current = await lstat(destination).catch(() => undefined);
    if (current?.isSymbolicLink()) {
      const target = await readlink(destination);
      if (resolve(dirname(destination), target) === source) return false;
    }
    if (current) return result("keyd", "blocked", `${destination} conflicts with the repository configuration; preserve it and replace manually: sudo cp -a ${destination} ${destination}.bak && sudo ln -s ${source} ${destination}`);
    const created = await c.run("sudo", ["ln", "-s", source, destination]);
    if (created.code !== 0) return result("keyd", "blocked", `Could not create ${destination}; run sudo ln -s ${source} ${destination}.`);
    return true;
  };
  const madeDirectory = await c.run("sudo", ["mkdir", "-p", "/etc/keyd"]);
  if (madeDirectory.code !== 0) return result("keyd", "blocked", "Could not create /etc/keyd; run sudo mkdir -p /etc/keyd.");
  let changed = false;
  for (const [source, destination] of links) {
    const linked = await ensureSystemLink(source, destination);
    if (typeof linked === "object") return linked;
    changed ||= linked;
  }
  if (devices === undefined) {
    const attention = ["Could not read /proc/bus/input/devices; existing Apple-specific configuration was preserved."];
    if (!keyd) attention.push("keyd is not installed; linked configuration will not be applied until the selected package is installed.");
    return result("keyd", changed ? "changed" : "unchanged", ...attention);
  }
  if (!hasAppleKeyboard) {
    const existing = await lstat(appleDestination).catch(() => undefined);
    if (existing?.isSymbolicLink() && resolve(dirname(appleDestination), await readlink(appleDestination)) === appleConfig) {
      const removed = await c.run("sudo", ["rm", appleDestination]);
      if (removed.code !== 0) return result("keyd", "failed", `Could not remove obsolete Apple-specific symlink ${appleDestination}.`);
      changed = true;
    }
  }
  if (!keyd) return result("keyd", changed ? "changed" : "unchanged", "keyd is not installed; linked configuration will not be applied until the selected package is installed.");
  const systemctl = executable(c, "systemctl");
  if (!systemctl) return result("keyd", changed ? "changed" : "unchanged", "systemd is unavailable; linked configuration is preserved but keyd service state was not changed.");
  const active = await c.run(systemctl, ["is-active", "--quiet", "keyd"], { quiet: true });
  const enabled = await c.run(systemctl, ["is-enabled", "--quiet", "keyd"], { quiet: true });
  if (enabled.code !== 0) {
    const enable = await c.run("sudo", ["systemctl", "enable", "keyd"]);
    if (enable.code !== 0) return result("keyd", "failed", "Could not enable keyd; run sudo systemctl enable keyd.");
  }
  if (active.code !== 0) {
    const start = await c.run("sudo", ["systemctl", "start", "keyd"]);
    if (start.code !== 0) return result("keyd", "failed", "Could not start keyd; run sudo systemctl start keyd.");
  } else if (changed) {
    const reload = await c.run("sudo", [keyd, "reload"]);
    if (reload.code !== 0) return result("keyd", "failed", "keyd configuration changed, but the active daemon could not reload it.");
  }
  return result("keyd", changed ? "changed" : "unchanged");
}
export async function installKeydFromSource(c: RecipeContext): Promise<ToolResult> {
  if (c.host.platform !== "linux") return result("keyd", "blocked", "The upstream keyd source route is Linux-only.");
  if (executable(c, "keyd") || executable(c, "keyd.rvaiya")) return result("keyd", "unchanged");
  const git = executable(c, "git"), make = executable(c, "make"), curl = executable(c, "curl");
  const apt = c.host.packageManagers.apt;
  const dpkg = executable(c, "dpkg-query"), cache = executable(c, "apt-cache");
  if (!git || !make || !curl || !apt || !dpkg || !cache) return result("keyd", "blocked", "The keyd source build requires APT, git, make, curl, dpkg-query, and apt-cache.");
  const required = ["build-essential", "git"];
  const missing: string[] = [];
  for (const pkg of required) {
    const installed = await c.run(dpkg, ["-W", "-f=${Status}", pkg], { quiet: true });
    if (installed.code === 0 && installed.stdout?.includes("install ok installed")) continue;
    const candidate = await c.run(cache, ["policy", pkg], { quiet: true });
    if (candidate.code !== 0 || !/Candidate:\s*\S+/.test(candidate.stdout ?? "") || /Candidate:\s*\(none\)/.test(candidate.stdout ?? "")) return result("keyd", "blocked", `APT has no candidate for keyd build prerequisite ${pkg}.`);
    missing.push(pkg);
  }
  if (missing.length) {
    const installed = await c.run("sudo", [apt, "install", "-y", ...missing]);
    if (installed.code !== 0) return result("keyd", "failed", `Could not install missing APT keyd build prerequisites: ${missing.join(", ")}.`);
  }
  const releases = await c.run(curl, ["-fsSL", "https://api.github.com/repos/rvaiya/keyd/releases/latest"], { quiet: true });
  if (releases.code !== 0) return result("keyd", "failed", "Could not look up the latest stable keyd release.");
  let tag = "";
  try { const metadata = JSON.parse(releases.stdout ?? "") as { tag_name?: string; prerelease?: boolean }; if (metadata.prerelease !== true && metadata.tag_name) tag = metadata.tag_name; } catch { /* invalid metadata */ }
  if (!tag) return result("keyd", "failed", "Keyd release metadata did not contain a stable tag.");
  const workspace = await mkdtemp(join(tmpdir(), "my-setup-keyd-"));
  try {
    const source = join(workspace, "keyd");
    const cloned = await c.run(git, ["clone", "--quiet", "--depth", "1", "--branch", tag, "https://github.com/rvaiya/keyd.git", source]);
    if (cloned.code !== 0) return result("keyd", "failed", `Could not clone keyd tag ${tag}.`);
    const built = await c.run(make, [], { cwd: source });
    if (built.code !== 0) return result("keyd", "failed", "Building the stable keyd release failed.");
    const installed = await c.run("sudo", [make, "install"], { cwd: source });
    if (installed.code !== 0) return result("keyd", "failed", "Installing the stable keyd build failed.");
    const verified = await c.run("keyd", ["--version"], { quiet: true });
    if (verified.code !== 0) return result("keyd", "failed", "keyd was installed but did not pass its executable version check.");
    return result("keyd", "changed");
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

export async function applyGnome(c: RecipeContext): Promise<ToolResult> {
  if (c.host.platform !== "linux") return result("gnome-apply", "blocked", "GNOME settings apply is Linux-only.");
  const host = c.host as RecipeContext["host"] & { activeGnome?: boolean; dbusAddress?: string; dconfAvailable?: boolean };
  const dconf = executable(c, "dconf");
  const dbusAddress = host.dbusAddress;
  if (!dconf || !host.dconfAvailable || !host.activeGnome || !dbusAddress) return result("gnome-apply", "blocked", "GNOME apply requires Linux, an active GNOME session, DBus address, and dconf.");
  const configPath = join(c.repoRoot, "gnome/dconf.ini");
  const config = await readFile(configPath, "utf8").catch(() => undefined);
  if (config === undefined) return result("gnome-apply", "failed", `Could not read ${configPath}.`);
  const managed: Array<{ key: string; desired: string }> = [];
  let section = "";
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const heading = /^\[([^\]]+)\]$/.exec(line);
    if (heading) { section = heading[1]!; continue; }
    const pair = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (pair) managed.push({ key: `/org/gnome/${section}/${pair[1]!.trim()}`, desired: pair[2]!.trim() });
  }
  const differences: string[] = [];
  for (const item of managed) {
    const current = await c.run(dconf, ["read", item.key], { env: { DBUS_SESSION_BUS_ADDRESS: dbusAddress }, quiet: true });
    if (current.code !== 0 || current.stdout?.trim() !== item.desired) differences.push(item.key);
  }
  if (!differences.length) return result("gnome-apply", "unchanged");
  const applied = await c.run(join(c.repoRoot, "gnome/apply.sh"), ["apply"], { env: { DBUS_SESSION_BUS_ADDRESS: dbusAddress } });
  if (applied.code !== 0) return result("gnome-apply", "failed", `GNOME helper could not apply managed settings: ${differences.join(", ")}.`);
  const unconfirmed: string[] = [];
  for (const item of managed) {
    const current = await c.run(dconf, ["read", item.key], { env: { DBUS_SESSION_BUS_ADDRESS: dbusAddress }, quiet: true });
    if (current.code !== 0 || current.stdout?.trim() !== item.desired) unconfirmed.push(item.key);
  }
  if (unconfirmed.length) return result("gnome-apply", "failed", `GNOME settings did not verify after apply: ${unconfirmed.join(", ")}.`);
  return result("gnome-apply", "changed", "Vicinae binary and extension setup are external prerequisites; none were changed.");
}

export interface MacDefault {
  domain: string;
  key: string;
  value: boolean | number | string;
  /** Process that must restart to load the value; it relaunches itself. */
  restart?: "Dock" | "SystemUIServer";
  /** What still has to happen after the restart for the value to apply everywhere. */
  followUp?: string;
}

const relaunchApps = "Quit and reopen running apps (or log out) so global window settings reach them.";
/** AeroSpace's documented macOS recommendations (guide + goodies), plus this setup's Dock preferences. */
export const macDefaults: readonly MacDefault[] = [
  // Guide, "Displays have separate Spaces": off is more stable for AeroSpace focus and performance.
  { domain: "com.apple.spaces", key: "spans-displays", value: true, restart: "SystemUIServer", followUp: "Log out and back in to finish turning off Displays have separate Spaces." },
  // Guide, "A note on mission control": group windows by application so Mission Control stays usable.
  { domain: "com.apple.dock", key: "expose-group-apps", value: true, restart: "Dock" },
  // Goodies: disable window opening animations.
  { domain: "NSGlobalDomain", key: "NSAutomaticWindowAnimationsEnabled", value: false, followUp: relaunchApps },
  // Goodies: move windows with Ctrl+Cmd dragging anywhere inside them.
  { domain: "NSGlobalDomain", key: "NSWindowShouldDragOnGesture", value: true, followUp: relaunchApps },
  // Guide: a bottom, auto-hidden Dock minimizes the sliver of windows on hidden workspaces.
  { domain: "com.apple.dock", key: "orientation", value: "bottom", restart: "Dock" },
  { domain: "com.apple.dock", key: "autohide", value: true, restart: "Dock" },
  // Reveal only after the pointer rests at the edge for a second, not on every pass.
  { domain: "com.apple.dock", key: "autohide-delay", value: 1.0, restart: "Dock" },
  // Desktop & Dock > Animate opening applications: off.
  { domain: "com.apple.dock", key: "launchanim", value: false, restart: "Dock" },
];

/** Compare `defaults read` output with a desired value; booleans print as 1/0 and floats without trailing zeros. */
export function macDefaultMatches(setting: MacDefault, output: string): boolean {
  const current = output.trim();
  if (typeof setting.value === "boolean") return current === (setting.value ? "1" : "0");
  if (typeof setting.value === "number") return current !== "" && Number(current) === setting.value;
  return current === setting.value;
}

export function macDefaultWriteArgs(setting: MacDefault): string[] {
  const type = typeof setting.value === "boolean" ? "-bool" : typeof setting.value === "number" ? "-float" : "-string";
  return ["write", setting.domain, setting.key, type, String(setting.value)];
}

export async function applyMacDefaults(c: RecipeContext, settings: readonly MacDefault[] = macDefaults): Promise<ToolResult> {
  if (c.host.platform !== "darwin") return result("macos-defaults", "blocked", "macOS settings apply only on macOS.");
  const defaults = executable(c, "defaults");
  if (!defaults) return result("macos-defaults", "blocked", "The macOS defaults command is unavailable.");
  const matches = async (setting: MacDefault) => {
    const current = await c.run(defaults, ["read", setting.domain, setting.key], { quiet: true });
    return current.code === 0 && macDefaultMatches(setting, current.stdout);
  };
  const changed: MacDefault[] = [];
  for (const setting of settings) {
    if (await matches(setting)) continue;
    const written = await c.run(defaults, macDefaultWriteArgs(setting), { quiet: true });
    if (written.code !== 0 || !await matches(setting)) return result("macos-defaults", "failed", `Could not set ${setting.domain} ${setting.key}${changed.length ? `; already applied: ${changed.map(item => item.key).join(", ")}` : ""}.`);
    changed.push(setting);
  }
  if (!changed.length) return result("macos-defaults", "unchanged");
  const attention: string[] = [];
  const killall = executable(c, "killall");
  for (const name of new Set(changed.flatMap(setting => setting.restart ? [setting.restart] : []))) {
    if (!killall || (await c.run(killall, [name], { quiet: true })).code !== 0) attention.push(`Restart ${name} (killall ${name}) or log out to load the new settings.`);
  }
  attention.push(...new Set(changed.flatMap(setting => setting.followUp ? [setting.followUp] : [])));
  console.log(`macos-defaults: set ${changed.map(setting => `${setting.domain} ${setting.key}`).join(", ")}`);
  return result("macos-defaults", "changed", ...attention);
}

export const amphetamineDomain = "com.if.Amphetamine";
export const amphetamineSettingsFile = "amphetamine/amphetamine.plist";

/**
 * Amphetamine's settings tracked in amphetamine/amphetamine.plist, as one `defaults` value per key. The app's own
 * plist cannot be a symlink: cfprefsd refuses to read or write a symlinked preferences file.
 */
export async function amphetamineSettings(c: RecipeContext): Promise<MacDefault[]> {
  const plutil = executable(c, "plutil") ?? "/usr/bin/plutil";
  const converted = await c.run(plutil, ["-convert", "json", "-o", "-", join(c.repoRoot, amphetamineSettingsFile)], { quiet: true, stdin: "ignore" });
  if (converted.code !== 0) throw new Error(`Could not read ${amphetamineSettingsFile}: ${converted.stderr.trim()}`);
  const parsed: unknown = JSON.parse(converted.stdout);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${amphetamineSettingsFile} must be a dictionary.`);
  return Object.entries(parsed).map(([key, value]) => {
    if (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") throw new Error(`${amphetamineSettingsFile}: ${key} must be a boolean, number, or string.`);
    return { domain: amphetamineDomain, key, value };
  });
}

/** Run one AppleScript line; the first run asks for permission to control the target app. */
async function appleScript(c: RecipeContext, osascript: string, script: string) {
  const output = await c.run(osascript, ["-e", script], { quiet: true, stdin: "ignore" });
  return { ok: output.code === 0, value: output.stdout.trim(), error: output.stderr.trim() };
}

/** Keep the Mac awake: tracked Amphetamine settings, Amphetamine as a login item, and a running session. */
export async function applyAmphetamine(c: RecipeContext, app: string): Promise<ToolResult> {
  const id = "amphetamine-config";
  if (c.host.platform !== "darwin") return result(id, "blocked", "Amphetamine is macOS-only.");
  const defaults = executable(c, "defaults"), osascript = executable(c, "osascript");
  if (!defaults || !osascript) return result(id, "blocked", "The macOS defaults and osascript commands are required.");
  if (!await lstat(join(app, "Contents/MacOS/Amphetamine")).then(() => true, () => false)) return result(id, "blocked", "Amphetamine is not installed; select Amphetamine and rerun.");
  const settings = await amphetamineSettings(c);
  const matches = async (setting: MacDefault) => {
    const current = await c.run(defaults, ["read", setting.domain, setting.key], { quiet: true });
    return current.code === 0 && macDefaultMatches(setting, current.stdout);
  };
  const running = async () => (await c.run("/usr/bin/pgrep", ["-x", "Amphetamine"], { quiet: true })).code === 0;
  const changes: string[] = [];
  const attention: string[] = [];
  // Amphetamine is sandboxed: its settings live in its container, which macOS shields from other apps unless the
  // terminal is allowed (first access asks; Full Disk Access also allows it). Probe before quitting the app.
  const container = join(c.home, "Library/Containers/com.if.Amphetamine/Data/Library");
  const shielded = await readdir(container).then(() => false, (error: NodeJS.ErrnoException) => error.code === "EPERM" || error.code === "EACCES");
  if (shielded) attention.push("macOS blocked this terminal from Amphetamine's settings. Allow it when macOS asks, or turn on Full Disk Access for the terminal in System Settings → Privacy & Security, then rerun.");
  else {
    const pending: MacDefault[] = [];
    for (const setting of settings) if (!await matches(setting)) pending.push(setting);
    if (pending.length) {
      // A running app would write its in-memory values back over ours.
      if (await running()) {
        const quit = await appleScript(c, osascript, `tell application "Amphetamine" to quit`);
        if (!quit.ok) return result(id, "failed", `Could not quit Amphetamine to update its settings (${quit.error}); quit it and rerun.`);
        for (let attempt = 0; attempt < 20 && await running(); attempt++) await Bun.sleep(250);
      }
      for (const setting of pending) {
        const written = await c.run(defaults, macDefaultWriteArgs(setting), { quiet: true });
        if (written.code !== 0 || !await matches(setting)) { attention.push(`Could not set Amphetamine “${setting.key}”${written.stderr.trim() ? ` (${written.stderr.trim()})` : ""}.`); break; }
      }
      if (!attention.length) changes.push(`set ${pending.map(setting => `“${setting.key}”`).join(", ")}`);
    }
  }
  const loginItems = await appleScript(c, osascript, `tell application "System Events" to get the path of every login item`);
  if (!loginItems.ok) return result(id, "failed", `Could not read login items (${loginItems.error}); allow the terminal to control System Events in System Settings → Privacy & Security → Automation.`);
  if (!loginItems.value.split(", ").some(path => path.replace(/\/$/, "") === app)) {
    const added = await appleScript(c, osascript, `tell application "System Events" to make login item at end with properties {path:"${app}", hidden:true}`);
    if (!added.ok) return result(id, "failed", `Could not add Amphetamine to login items (${added.error}).`);
    changes.push("opens at login");
  }
  if (!await running()) {
    const opened = await c.run("/usr/bin/open", ["-g", "-a", app], { quiet: true });
    if (opened.code !== 0) return result(id, "failed", "Could not open Amphetamine.");
    for (let attempt = 0; attempt < 40 && !await running(); attempt++) await Bun.sleep(250);
  }
  // “Start Session At Launch” covers fresh launches; an app that was already running needs the session started here.
  let active = await appleScript(c, osascript, `tell application "Amphetamine" to session is active`);
  for (let attempt = 0; attempt < 20 && active.ok && active.value !== "true"; attempt++) { await Bun.sleep(250); active = await appleScript(c, osascript, `tell application "Amphetamine" to session is active`); }
  if (!active.ok) return result(id, "failed", `Could not ask Amphetamine for its session (${active.error}); allow the terminal to control Amphetamine in System Settings → Privacy & Security → Automation.`);
  if (active.value !== "true") {
    const started = await appleScript(c, osascript, `tell application "Amphetamine" to start new session`);
    const confirmed = await appleScript(c, osascript, `tell application "Amphetamine" to session is active`);
    if (!started.ok || confirmed.value !== "true") return result(id, "failed", "Amphetamine is running but would not start a keep-awake session.");
    changes.push("started a session");
  }
  if (changes.length) console.log(`${id}: ${changes.join("; ")}`);
  if (attention.length) return result(id, "blocked", ...attention);
  return result(id, changes.length ? "changed" : "unchanged");
}
