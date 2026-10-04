import { lstat, readFile, readlink } from "node:fs/promises";
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
