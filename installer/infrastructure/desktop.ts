import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, readdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { systemConfigurationFiles } from "../domain/catalog";
import type { RecipeContext, ToolResult } from "./tools";

function result(id: string, status: ToolResult["status"], ...attention: string[]): ToolResult {
  return { id, status, attention };
}
function executable(c: RecipeContext, name: string): string | undefined {
  return c.host.executables.get(name);
}

const keydPinnedTag = "v2.6.0";
const keydPinnedCommit = "7c0aecb8bfd34dc8642bf4eefd2e59c89e61cec3";
const keydRecordFile = ".my-setup-sha256";
const keydBackupRoot = ".my-setup-backups";
const keydRecordLine = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/;
const keydApplePresent = /(?:Vendor=004c|Vendor=05ac).*?Product=029c|Product=029c.*?Vendor=(?:004c|05ac)/is;

type KeydPaths = { directory: string; inputDevices: string; owner?: number };
type Existing = { kind: "absent" } | { kind: "link"; points: boolean } | { kind: "other" } | { kind: "file"; digest: string; owned: boolean; safe: boolean };
type Step = { name: string; target: string; prior: Existing; config: boolean } & ({ kind: "remove" } | { kind: "copy"; source: string } | { kind: "record"; content: string });
type Applied = { step: Step; restoreFrom?: string };

const digestOf = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const sudoOk = async (c: RecipeContext, args: string[]) => (await c.run("sudo", args)).code === 0;
const serialize = (records: Map<string, string>) => [...records].sort(([a], [b]) => a.localeCompare(b)).map(([name, digest]) => `${digest}  ${name}\n`).join("");

async function inspect(path: string, owner: number, source?: string): Promise<Existing> {
  const stat = await lstat(path).catch(() => undefined);
  if (!stat) return { kind: "absent" };
  if (stat.isSymbolicLink()) return { kind: "link", points: source !== undefined && resolve(dirname(path), await readlink(path)) === source };
  if (!stat.isFile()) return { kind: "other" };
  return { kind: "file", digest: await digestOf(path), owned: stat.uid === owner, safe: stat.uid === owner && (stat.mode & 0o022) === 0 };
}

export async function installKeyd(c: RecipeContext, paths: KeydPaths = { directory: "/etc/keyd", inputDevices: "/proc/bus/input/devices" }): Promise<ToolResult> {
  if (c.host.platform !== "linux") return result("keyd", "blocked", "keyd is supported only on Linux.");
  const owner = paths.owner ?? 0;
  const keyd = executable(c, "keyd") ?? executable(c, "keyd.rvaiya");
  const devices = await readFile(paths.inputDevices, "utf8").catch(() => undefined);
  const hasApple = devices !== undefined && keydApplePresent.test(devices);
  const directoryStat = await lstat(paths.directory).catch(() => undefined);
  if (directoryStat && (!directoryStat.isDirectory() || directoryStat.uid !== owner || (directoryStat.mode & 0o022) !== 0)) return result("keyd", "blocked", `${paths.directory} must be a root-owned directory without group or world write access; repair it manually.`);
  const recordPath = join(paths.directory, keydRecordFile);
  const recordStat = directoryStat ? await lstat(recordPath).catch(() => undefined) : undefined;
  const recorded = new Map<string, string>();
  if (recordStat) {
    if (!recordStat.isFile() || recordStat.uid !== owner || (recordStat.mode & 0o022) !== 0) return result("keyd", "blocked", `${recordPath} must be a root-owned regular file without group or world write access; repair it manually.`);
    for (const line of (await readFile(recordPath, "utf8")).split("\n")) {
      if (!line) continue;
      const match = keydRecordLine.exec(line);
      if (!match || recorded.has(match[2])) return result("keyd", "blocked", `${recordPath} is malformed; check the managed files, then remove it or repair it manually.`);
      recorded.set(match[2], match[1]);
    }
  }
  const blocked: string[] = [];
  const attention: string[] = [];
  const steps: Step[] = [];
  const next = new Map(recorded);
  for (const [source, destination] of systemConfigurationFiles["keyd-config"] ?? []) {
    const name = basename(destination);
    const sourcePath = join(c.repoRoot, source);
    const target = join(paths.directory, name);
    const apple = source.includes("apple");
    const desired = await digestOf(sourcePath);
    const current = await inspect(target, owner, sourcePath);
    const recordedDigest = recorded.get(name);
    const write = (prior: Existing) => { steps.push({ kind: "copy", source: sourcePath, name, target, prior, config: true }); next.set(name, desired); };
    if (apple && devices !== undefined && !hasApple) {
      if ((current.kind === "link" && current.points) || (current.kind === "file" && current.owned && recordedDigest === current.digest)) {
        steps.push({ kind: "remove", name, target, prior: current, config: true });
        next.delete(name);
      } else if (current.kind === "file" && current.owned && recordedDigest !== undefined) attention.push(`${target} was edited after my-setup published it, so it was kept; remove it manually if the Apple-specific mapping is no longer wanted.`);
      continue;
    }
    if (apple && devices === undefined) {
      if (current.kind === "link" && current.points) write(current);
      continue;
    }
    if (current.kind === "absent") write(current);
    else if (current.kind === "link") {
      if (current.points) write(current);
      else blocked.push(`${target} is a link that does not point at ${sourcePath}; preserve it and move it aside (sudo mv ${target} ${target}.bak), then rerun.`);
    } else if (current.kind === "other") blocked.push(`${target} is not a regular file; move it aside, then rerun.`);
    else if (!current.owned) blocked.push(`${target} is not owned by root; move it aside, then rerun.`);
    else if (current.digest === desired) {
      if (current.safe) next.set(name, desired);
      else write(current);
    } else if (recordedDigest === current.digest) write(current);
    else blocked.push(`${target} differs from ${sourcePath} and was not published by my-setup; move it aside or restore it, then rerun.`);
  }
  if (blocked.length) return result("keyd", "blocked", ...blocked);
  if (serialize(recorded) !== serialize(next)) {
    const prior = await inspect(recordPath, owner);
    steps.push(next.size
      ? { kind: "record", name: keydRecordFile, target: recordPath, prior, config: false, content: serialize(next) }
      : { kind: "remove", name: keydRecordFile, target: recordPath, prior, config: false });
  }
  if (devices === undefined) attention.push(`Could not read ${paths.inputDevices}; existing Apple-specific configuration was preserved.`);
  const changed = steps.length > 0;
  const configChanged = steps.some((step) => step.config);
  if (changed && !directoryStat && !await sudoOk(c, ["install", "-d", "-o", "root", "-g", "root", "-m", "0755", paths.directory])) return result("keyd", "failed", `Could not create ${paths.directory}; run sudo install -d -o root -g root -m 0755 ${paths.directory}.`);
  const applied: { applied: Applied[]; backup?: string; error?: string } = changed ? await applyKeydSteps(c, paths.directory, steps) : { applied: [] };
  if (applied.error) return result("keyd", "failed", applied.error, ...attention);
  if (applied.backup) attention.push(`Replaced or removed files were backed up to ${applied.backup}.`);
  const status = changed ? "changed" : "unchanged";
  const finish = (...extra: string[]) => result("keyd", status, ...attention, ...extra);
  if (!keyd) return finish("keyd is not installed; installed configuration will not be applied until the selected package is installed.");
  const systemctl = executable(c, "systemctl");
  if (!systemctl) return finish("systemd is unavailable; installed configuration is preserved but keyd service state was not changed.");
  const active = await c.run(systemctl, ["is-active", "--quiet", "keyd"], { quiet: true });
  const enabled = await c.run(systemctl, ["is-enabled", "--quiet", "keyd"], { quiet: true });
  if (enabled.code !== 0 && !await sudoOk(c, ["systemctl", "enable", "keyd"])) return result("keyd", "failed", ...attention, "Could not enable keyd; run sudo systemctl enable keyd.");
  if (active.code !== 0) {
    if (!await sudoOk(c, ["systemctl", "start", "keyd"])) return result("keyd", "failed", ...attention, "Could not start keyd; run sudo systemctl start keyd.");
    return finish();
  }
  if (!configChanged || await sudoOk(c, [keyd, "reload"])) return finish();
  const restored = await restoreKeydSteps(c, paths.directory, applied.applied);
  const detail = restored ?? ((await sudoOk(c, [keyd, "reload"])) ? "the previous configuration was restored and reloaded" : "the previous configuration was restored but keyd could not reload it; run sudo keyd reload");
  return result("keyd", "failed", ...attention, `keyd configuration changed, but the active daemon could not reload it; ${detail}${applied.backup ? ` (backups: ${applied.backup})` : ""}.`);
}

async function withStage(c: RecipeContext, directory: string, action: (stage: string) => Promise<string | undefined>): Promise<string | undefined> {
  const stage = join(directory, `.my-setup-stage-${randomUUID()}`);
  if (!await sudoOk(c, ["mkdir", "-m", "0700", stage])) return `Could not create staging directory ${stage}.`;
  const error = await action(stage);
  const removed = await sudoOk(c, ["rm", "-rf", stage]);
  return error ?? (removed ? undefined : `Could not remove staging directory ${stage}.`);
}

async function applyKeydSteps(c: RecipeContext, directory: string, steps: Step[]): Promise<{ applied: Applied[]; backup?: string; error?: string }> {
  const workspace = await mkdtemp(join(tmpdir(), "my-setup-keyd-"));
  const backup = join(directory, keydBackupRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  const backups = new Map<Step, string>();
  try {
    if (steps.some((step) => step.prior.kind !== "absent")) {
      if (!await sudoOk(c, ["install", "-d", "-o", "root", "-g", "root", "-m", "0700", join(directory, keydBackupRoot)]) || !await sudoOk(c, ["mkdir", "-m", "0700", backup])) return { error: `Could not create keyd backup directory ${backup}.`, applied: [] };
      for (const step of steps) {
        if (step.prior.kind === "absent") continue;
        const path = step.prior.kind === "file" ? join(backup, step.name) : join(backup, `${step.name}.snapshot`);
        const copied = step.prior.kind === "file"
          ? await sudoOk(c, ["install", "-o", "root", "-g", "root", "-m", "0600", step.target, path])
          : await sudoOk(c, ["cp", "-a", step.target, join(backup, step.name)]) && await sudoOk(c, ["install", "-o", "root", "-g", "root", "-m", "0600", step.target, path]);
        if (!copied) return { error: `Could not back up ${step.target}; nothing was changed.`, applied: [] };
        backups.set(step, path);
      }
    }
    const applied: Applied[] = [];
    const error = await withStage(c, directory, async (stage) => {
      for (const step of steps) {
        if (step.kind === "remove") continue;
        const source = step.kind === "copy" ? step.source : join(workspace, step.name);
        if (step.kind === "record") await writeFile(source, step.content);
        if (!await sudoOk(c, ["install", "-o", "root", "-g", "root", "-m", "0644", source, join(stage, step.name)])) return `Could not stage ${step.target}; nothing was changed.`;
      }
      for (const step of steps) {
        const published = step.kind === "remove" ? await sudoOk(c, ["rm", "-f", step.target]) : await sudoOk(c, ["mv", "-fT", join(stage, step.name), step.target]);
        if (!published) return `Could not publish ${step.target}.`;
        applied.push({ step, restoreFrom: backups.get(step) });
      }
      return undefined;
    });
    if (error) {
      const restored = await restoreKeydSteps(c, directory, applied);
      return { error: restored ? `${error} ${restored}` : `${error} Previous files were restored.`, applied: [] };
    }
    return { applied, backup: backups.size ? backup : undefined };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function restoreKeydSteps(c: RecipeContext, directory: string, applied: Applied[]): Promise<string | undefined> {
  if (!applied.length) return undefined;
  return withStage(c, directory, async (stage) => {
    for (const { step, restoreFrom } of [...applied].reverse()) {
      const restored = restoreFrom === undefined
        ? await sudoOk(c, ["rm", "-f", step.target])
        : await sudoOk(c, ["install", "-o", "root", "-g", "root", "-m", "0644", restoreFrom, join(stage, step.name)]) && await sudoOk(c, ["mv", "-fT", join(stage, step.name), step.target]);
      if (!restored) return `Could not restore ${step.target}${restoreFrom ? ` from ${restoreFrom}` : ""}.`;
    }
    return undefined;
  });
}

export async function installKeydFromSource(c: RecipeContext): Promise<ToolResult> {
  if (c.host.platform !== "linux") return result("keyd", "blocked", "The upstream keyd source route is Linux-only.");
  if (executable(c, "keyd") || executable(c, "keyd.rvaiya")) return result("keyd", "unchanged");
  const git = executable(c, "git"), make = executable(c, "make");
  const apt = c.host.packageManagers.apt;
  const dpkg = executable(c, "dpkg-query"), cache = executable(c, "apt-cache");
  if (!git || !make || !apt || !dpkg || !cache) return result("keyd", "blocked", "The keyd source build requires APT, git, make, dpkg-query, and apt-cache.");
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
  const workspace = await mkdtemp(join(tmpdir(), "my-setup-keyd-"));
  try {
    const source = join(workspace, "keyd");
    const cloned = await c.run(git, ["clone", "--quiet", "--depth", "1", "--branch", keydPinnedTag, "https://github.com/rvaiya/keyd.git", source]);
    if (cloned.code !== 0) return result("keyd", "failed", `Could not clone keyd ${keydPinnedTag}.`);
    const head = await c.run(git, ["rev-parse", "HEAD"], { cwd: source, quiet: true });
    if (head.code !== 0 || head.stdout?.trim() !== keydPinnedCommit) return result("keyd", "failed", `keyd ${keydPinnedTag} does not resolve to the pinned commit ${keydPinnedCommit}.`);
    const built = await c.run(make, [], { cwd: source });
    if (built.code !== 0) return result("keyd", "failed", `Building keyd ${keydPinnedTag} failed.`);
    const installed = await c.run("sudo", [make, "install"], { cwd: source });
    if (installed.code !== 0) return result("keyd", "failed", `Installing keyd ${keydPinnedTag} failed.`);
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
