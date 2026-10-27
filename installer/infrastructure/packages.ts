import { mkdtemp, readFile, readdir, stat, lstat, mkdir, copyFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import type { HostFacts } from "./host.ts";
import type { CommandOptions } from "../application/ports";
import { downloadPins, pinFor } from "../domain/download-pins";
import type { ArchivePin, DownloadPins } from "../domain/download-pins";
import { publishExecutables, unpackPinnedArchive } from "./downloads";

export interface CommandResult { code: number; stdout: string; stderr: string }
export type RunCommand = (executable: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
/** `installed` means a healthy executable exists; `outdated` marks an installed tool whose `route` updates it. */
export interface SoftwareState { installed: boolean; healthy: boolean; reason?: string; route?: string; packageName?: string; outdated?: boolean }
export interface RecipeContext {
  host: HostFacts;
  home: string;
  repoRoot: string;
  run: RunCommand;
  ensureLink(source: string, destination: string): Promise<"changed" | "unchanged">;
  backupUserFile?(destination: string): Promise<string>;
  refreshHost?(): Promise<void>;
}
export type PackageContext = RecipeContext;
/** Routes that elevate with sudo; the CLI authenticates once before running them. */
export const packageSudoRoutes: ReadonlySet<string> = new Set(["apt", "apt-reinstall", "apt-fontconfig"]);

const aptNames: Record<string, string> = { fd: "fd-find", ripgrep: "ripgrep", bat: "bat", "linux-desktop": "rofi network-manager network-manager-gnome pulseaudio-utils pipewire pipewire-audio-client-libraries wireplumber" };
const brewNames: Record<string, string> = { aerospace: "--cask nikitabobko/tap/aerospace", alacritty: "--cask alacritty", nerdFont: "--cask font-geist-mono-nerd-font", zshAbbr: "olets/tap/zsh-abbr" };
const aptPackage = (id: string) => aptNames[id] ?? id;
const brewPackage = (id: string) => brewNames[id] ?? id;
const commandFor = (host: HostFacts, key: string) => host.executables.get(key);

const executableAliases: Record<string, readonly string[]> = { fd: ["fd", "fdfind"], bat: ["bat", "batcat"], keyd: ["keyd", "keyd.rvaiya"], ripgrep: ["rg"] };
const versionArgs: Record<string, readonly string[]> = { tmux: ["-V"] };

export async function executableHealthy(context: PackageContext, id: string): Promise<boolean> {
  for (const name of executableAliases[id] ?? [id]) {
    const executable = commandFor(context.host, name);
    if (!executable) continue;
    const result = await context.run(executable, versionArgs[name] ?? ["--version"], { quiet: true });
    if (result.code === 0) return true;
  }
  return false;
}

interface BrewInventory { installed: ReadonlySet<string>; outdated: ReadonlySet<string> }
/** One inventory per host snapshot; refreshHost replaces the host, which invalidates it. */
const brewInventories = new WeakMap<HostFacts, Promise<BrewInventory>>();
const brewShortName = (pkg: string) => pkg.split("/").at(-1)!;
function brewInventory(context: PackageContext, brew: string): Promise<BrewInventory> {
  let inventory = brewInventories.get(context.host);
  if (!inventory) {
    inventory = (async () => {
      const [formulae, casks, outdated] = await Promise.all([
        context.run(brew, ["list", "--formula", "-1"], { quiet: true }),
        context.run(brew, ["list", "--cask", "-1"], { quiet: true }),
        context.run(brew, ["outdated", "--json=v2"], { quiet: true }),
      ]);
      const installed = new Set([...formulae.stdout.split("\n"), ...casks.stdout.split("\n")].map(line => line.trim()).filter(Boolean));
      const stale = new Set<string>();
      try {
        const data = JSON.parse(outdated.stdout) as { formulae?: Array<{ name?: string }>; casks?: Array<{ name?: string }> };
        for (const item of [...data.formulae ?? [], ...data.casks ?? []]) if (item.name) stale.add(brewShortName(item.name));
      } catch { /* Without outdated metadata, installed packages are left as they are. */ }
      return { installed, outdated: stale };
    })();
    brewInventories.set(context.host, inventory);
  }
  return inventory;
}
export async function brewInstalled(context: PackageContext, pkg: string): Promise<boolean | undefined> {
  const brew = context.host.packageManagers.brew;
  if (!brew) return undefined;
  return (await brewInventory(context, brew)).installed.has(brewShortName(pkg));
}
async function brewOutdated(context: PackageContext, pkg: string): Promise<boolean> {
  const brew = context.host.packageManagers.brew;
  if (!brew) return false;
  const inventory = await brewInventory(context, brew);
  return inventory.installed.has(brewShortName(pkg)) && inventory.outdated.has(brewShortName(pkg));
}
/** Healthy Homebrew-managed software that Homebrew reports outdated gets an upgrade route. */
export async function healthyState(context: PackageContext, brewName: string | undefined): Promise<SoftwareState> {
  if (brewName && await brewOutdated(context, brewName.replace(/^--cask /, ""))) return { installed: true, healthy: true, outdated: true, route: "brew-upgrade", packageName: brewName };
  return { installed: true, healthy: true };
}
export async function brewCaskEnabled(context: PackageContext, pkg: string): Promise<boolean> {
  const brew = context.host.packageManagers.brew;
  if (!brew) return false;
  const info = await context.run(brew, ["info", "--json=v2", "--cask", pkg], { quiet: true });
  if (info.code !== 0) return false;
  try {
    const data = JSON.parse(info.stdout) as { casks?: Array<{ token?: string; disabled?: unknown; depends_on?: { macos?: unknown; arch?: string | string[] } }> };
    const cask = data.casks?.find(item => item.token === pkg) ?? data.casks?.[0];
    if (!cask || cask.disabled) return false;
    const currentVersion = (context.host.macOS.version ?? "").split(".").map(Number);
    // Homebrew emits `depends_on.macos` as a string, a list, or an operator map such as {">=": ["12"]}.
    const requirements = cask.depends_on?.macos;
    const requirementList = typeof requirements === "string" ? [requirements]
      : Array.isArray(requirements) ? requirements.map(String)
      : requirements && typeof requirements === "object" ? Object.entries(requirements).flatMap(([operator, values]) => (Array.isArray(values) ? values : [values]).map(value => `${operator} ${String(value)}`))
      : [];
    for (const requirement of requirementList) {
      const normalized = String(requirement).toLowerCase();
      const codenames: Record<string, number[]> = { high_sierra: [10, 13], mojave: [10, 14], catalina: [10, 15], big_sur: [11], monterey: [12], ventura: [13], sonoma: [14], sequoia: [15], tahoe: [26] };
      const codename = normalized.match(/:([a-z_]+)/)?.[1];
      const numeric = normalized.match(/\d+(?:\.\d+)*/)?.[0];
      const requiredVersion = codename ? codenames[codename] : numeric?.split(".").map(Number);
      if (!requiredVersion || !currentVersion[0]) return false;
      const compare = (left: number[], right: number[]) => {
        for (let index = 0; index < Math.max(left.length, right.length); index++) {
          const delta = (left[index] ?? 0) - (right[index] ?? 0);
          if (delta) return Math.sign(delta);
        }
        return 0;
      };
      const order = compare(currentVersion, requiredVersion);
      const operator = normalized.match(/>=|<=|>|<|=/)?.[0] ?? ">=";
      if ((operator === ">=" && order < 0) || (operator === ">" && order <= 0) || (operator === "<=" && order > 0) || (operator === "<" && order >= 0) || (operator === "=" && order !== 0)) return false;
    }
    const architectures = cask.depends_on?.arch;
    if (architectures) {
      const supported = (Array.isArray(architectures) ? architectures : [architectures]).map(value => String(value).toLowerCase());
      if (supported.some(value => value.includes("arm64") || value.includes("aarch64")) && context.host.architecture !== "arm64") return false;
      if (supported.some(value => value.includes("x86_64") || value.includes("intel")) && context.host.architecture !== "x64") return false;
    }
    return true;
  } catch { return false; }
}
export async function aptInstalled(context: PackageContext, pkg: string): Promise<boolean | undefined> {
  const dpkg = context.host.packageManagers.dpkgQuery;
  if (!dpkg) return undefined;
  const result = await context.run(dpkg, ["-W", "-f=${Status}", pkg], { quiet: true });
  return result.code === 0 && result.stdout.includes("install ok installed");
}
export async function aptCandidate(context: PackageContext, pkg: string): Promise<boolean> {
  const cache = commandFor(context.host, "apt-cache");
  if (!cache) return false;
  const result = await context.run(cache, ["policy", pkg], { quiet: true });
  return result.code === 0 && /Candidate:\s*\S+/.test(result.stdout) && !/Candidate:\s*\(none\)/.test(result.stdout);
}

async function inspectAlacrittySource(context: PackageContext): Promise<SoftwareState> {
  const xcode = commandFor(context.host, "xcode-select");
  if (!xcode || (await context.run(xcode, ["-p"], { quiet: true })).code !== 0) return { installed: false, healthy: false, reason: "Install Xcode command-line tools with xcode-select --install, then rerun." };
  const required = ["clang", "make", "tic", "gzip", "codesign", "git", "curl", "tar"];
  const missing = required.filter(name => !commandFor(context.host, name));
  if (missing.length) return { installed: false, healthy: false, reason: `Alacritty source build requires ${missing.join(", ")}.` };
  const rustMissing = !commandFor(context.host, "cargo") || !commandFor(context.host, "rustc") || !commandFor(context.host, "scdoc");
  if (rustMissing && !context.host.packageManagers.brew) return { installed: false, healthy: false, reason: "Alacritty source build needs Rust and scdoc; install Rust >=1.85.0 and scdoc, then rerun." };
  return { installed: false, healthy: false, route: "source", reason: "Homebrew's Alacritty cask is unavailable; build the latest stable upstream release." };
}

/** Latest stable GitHub release tag, or undefined when offline/rate-limited (installed software is then left alone). */
export async function latestGithubRelease(context: PackageContext, repository: string): Promise<string | undefined> {
  const curl = commandFor(context.host, "curl");
  if (!curl) return undefined;
  const response = await context.run(curl, ["-fsSL", `https://api.github.com/repos/${repository}/releases/latest`], { quiet: true });
  if (response.code !== 0) return undefined;
  try {
    const data = JSON.parse(response.stdout) as { tag_name?: unknown; prerelease?: unknown };
    return !data.prerelease && typeof data.tag_name === "string" ? data.tag_name : undefined;
  } catch { return undefined; }
}

async function inspectAlacrittyDarwin(context: PackageContext): Promise<SoftwareState> {
  const brew = context.host.packageManagers.brew;
  const executable = commandFor(context.host, "alacritty");
  const version = executable ? await context.run(executable, ["--version"], { quiet: true }) : undefined;
  if (version?.code === 0) {
    if (await brewInstalled(context, "alacritty")) return healthyState(context, brewPackage("alacritty"));
    const installed = /alacritty\s+(\d+\.\d+\.\d+)/.exec(version.stdout)?.[1];
    const latest = (await latestGithubRelease(context, "alacritty/alacritty"))?.replace(/^v/, "");
    if (!installed || !latest || installed === latest) return { installed: true, healthy: true };
    const source = await inspectAlacrittySource(context);
    return source.route ? { ...source, installed: true, healthy: true, outdated: true, reason: `Alacritty ${installed} is installed; rebuild the latest stable release ${latest}.` } : { installed: true, healthy: true };
  }
  if (brew && await brewCaskEnabled(context, "alacritty")) return { installed: false, healthy: false, route: "brew", packageName: brewPackage("alacritty") };
  return inspectAlacrittySource(context);
}

export const aerospaceRepository = "https://github.com/nikitabobko/AeroSpace.git";
export const aerospaceApp = "/Applications/AeroSpace.app";
/** DEVELOPER_DIR of a full Xcode install; AeroSpace's release build needs xcodebuild, which the CLT lack. */
export async function fullXcodeDeveloperDir(context: PackageContext): Promise<string | undefined> {
  const candidates: string[] = [];
  const selector = commandFor(context.host, "xcode-select");
  const selected = selector ? await context.run(selector, ["-p"], { quiet: true }) : undefined;
  if (selected?.code === 0 && selected.stdout.includes(".app/")) candidates.push(selected.stdout.trim());
  const apps = (await readdir("/Applications").catch(() => [] as string[])).filter(name => /^Xcode.*\.app$/.test(name)).sort((left, right) => (left === "Xcode.app" ? -1 : right === "Xcode.app" ? 1 : left.localeCompare(right)));
  candidates.push(...apps.map(name => join("/Applications", name, "Contents/Developer")));
  for (const candidate of candidates) {
    if ((await context.run(join(candidate, "usr/bin/xcodebuild"), ["-version"], { quiet: true, env: { DEVELOPER_DIR: candidate } }).catch(() => undefined))?.code === 0) return candidate;
  }
  return undefined;
}

async function inspectAerospace(context: PackageContext): Promise<SoftwareState> {
  const cli = commandFor(context.host, "aerospace");
  const version = cli ? await context.run(cli, ["--version"], { quiet: true }) : undefined;
  const appPresent = await stat(join(aerospaceApp, "Contents/MacOS/AeroSpace")).then(() => true, () => false);
  const installed = version?.code === 0 && appPresent;
  const cask = Boolean(await brewInstalled(context, "aerospace"));
  const sourceAvailable = Boolean(context.host.packageManagers.brew && commandFor(context.host, "git") && await fullXcodeDeveloperDir(context));
  if (!sourceAvailable) {
    if (installed) return cask ? healthyState(context, brewPackage("aerospace")) : { installed: true, healthy: true };
    if (await brewCaskEnabled(context, brewPackage("aerospace").replace(/^--cask /, ""))) return { installed: false, healthy: false, route: cask ? "brew-reinstall" : "brew", packageName: brewPackage("aerospace"), reason: "Full Xcode or Homebrew is unavailable for a source build; installing the AeroSpace Homebrew cask instead." };
    return { installed: false, healthy: false, reason: "AeroSpace needs Homebrew plus full Xcode (source build) or an enabled Homebrew cask." };
  }
  if (!installed) return { installed: false, healthy: false, route: "aerospace-source", reason: "Build AeroSpace from the main branch." };
  if (cask) return { installed: true, healthy: true, outdated: true, route: "aerospace-source", reason: "Replace the AeroSpace Homebrew cask with a build of the main branch." };
  const remote = await context.run(commandFor(context.host, "git")!, ["ls-remote", aerospaceRepository, "refs/heads/main"], { quiet: true });
  const head = remote.code === 0 ? /^([0-9a-f]{40})\s/.exec(remote.stdout)?.[1] : undefined;
  if (!head || version.stdout.includes(head)) return { installed: true, healthy: true };
  return { installed: true, healthy: true, outdated: true, route: "aerospace-source", reason: "Rebuild AeroSpace from the newer main branch." };
}

export async function inspectSoftware(context: PackageContext, id: string): Promise<SoftwareState> {
  if (id === "linux-desktop") {
    if (context.host.platform !== "linux" || !context.host.packageManagers.apt) return { installed: false, healthy: false, reason: "The native desktop bundle requires Linux with APT." };
    const names = aptPackage(id).split(" ");
    const installed = await Promise.all(names.map(name => aptInstalled(context, name)));
    if (installed.every(Boolean)) return { installed: true, healthy: true };
    const missing = names.filter((_, index) => !installed[index]);
    const candidates = await Promise.all(missing.map(name => aptCandidate(context, name)));
    if (candidates.every(Boolean)) return { installed: false, healthy: false, route: "apt", packageName: missing.join(" ") };
    return { installed: false, healthy: false, reason: `APT candidates unavailable for desktop bundle packages: ${missing.filter((_, index) => !candidates[index]).join(", ")}` };
  }
  if (id === "volta") return inspectVolta(context);
  if (id === "node-lts") return inspectNodeLts(context);
  if (id === "nerd-font") return inspectGeistFont(context);
  if (id === "alacritty" && context.host.platform === "darwin") return inspectAlacrittyDarwin(context);
  if (id === "aerospace" && context.host.platform === "darwin") return inspectAerospace(context);
  const brew = context.host.packageManagers.brew;
  const apt = context.host.packageManagers.apt;
  const brewName = brew && !(id === "alacritty" && context.host.platform === "linux") ? brewPackage(id) : undefined;
  if (await executableHealthy(context, id)) return healthyState(context, brewName);
  if (brew && brewName) {
    const cask = brewName.startsWith("--cask ");
    const pkg = brewName.replace(/^--cask /, "");
    if (await brewInstalled(context, pkg)) return { installed: false, healthy: false, reason: `${pkg} is installed by Homebrew but its executable is unhealthy; reinstalling it.`, route: "brew-reinstall", packageName: brewName };
    if (cask ? await brewCaskEnabled(context, pkg) : await context.run(brew, ["info", "--json=v2", pkg], { quiet: true }).then(info => info.code === 0 && info.stdout.includes(pkg))) return { installed: false, healthy: false, route: "brew", packageName: brewName };
  }
  if (apt && context.host.platform === "linux") {
    const pkg = aptPackage(id);
    const names = pkg.split(" ");
    const states = await Promise.all(names.map(name => aptInstalled(context, name)));
    if (states.some(Boolean)) return { installed: false, healthy: false, reason: `${pkg} is installed by APT but its executable is unhealthy; reinstalling it.`, route: "apt-reinstall", packageName: pkg };
    const candidates = await Promise.all(names.map(name => aptCandidate(context, name)));
    if (candidates.every(Boolean)) return { installed: false, healthy: false, route: "apt", packageName: pkg };
    if (["starship", "zoxide", "fzf", "bat", "eza", "fd", "ripgrep", "killport"].includes(id)) {
      if (releasePin(context, id)) return { installed: false, healthy: false, route: "github-release" };
      if (id === "fzf") return { installed: false, healthy: false, route: "git-checkout" };
    }
    if (id === "keyd") return { installed: false, healthy: false, route: "keyd-source-build", reason: "No APT keyd candidate; build the pinned upstream keyd v2.6.0 release with APT build prerequisites." };
    return { installed: false, healthy: false, reason: `APT candidate unavailable: ${names.filter((_, i) => !candidates[i]).join(", ")}` };
  }
  if (["starship", "zoxide", "fzf", "bat", "eza", "fd", "ripgrep", "killport"].includes(id) && context.host.platform === "linux") {
    if (releasePin(context, id)) return { installed: false, healthy: false, route: "github-release" };
    if (id === "fzf") return { installed: false, healthy: false, route: "git-checkout" };
  }
  if (id === "zsh-abbr") return { installed: false, healthy: false, route: brew ? "brew" : "git-checkout", packageName: "olets/tap/zsh-abbr" };
  return { installed: false, healthy: false, reason: "No supported installation route is available." };
}

async function installCheckout(context: PackageContext, id: string): Promise<CommandResult> {
  const git = commandFor(context.host, "git");
  if (!git) return { code: 1, stdout: "", stderr: "git is required for this installation" };
  const destination = id === "zsh-abbr" ? join(context.home, ".config/zsh-abbr") : join(context.home, ".fzf");
  try { await stat(destination); return { code: 1, stdout: "", stderr: `${destination} already exists; inspect it without overwriting user data` }; } catch { /* absent */ }
  const url = id === "zsh-abbr" ? "https://github.com/olets/zsh-abbr.git" : "https://github.com/junegunn/fzf.git";
  const cloned = await context.run(git, ["clone", "--depth", "1", "--branch", "main", ...(id === "zsh-abbr" ? ["--recurse-submodules"] : []), url, destination]);
  if (cloned.code !== 0) return cloned;
  if (id === "fzf") {
    const installed = await context.run(join(destination, "install"), ["--bin", "--no-update-rc"], { cwd: destination });
    if (installed.code !== 0) return installed;
    const bin = join(context.home, ".local/bin"); await mkdir(bin, { recursive: true });
    await context.ensureLink(join(destination, "bin/fzf"), join(bin, "fzf"));
  }
  return { code: 0, stdout: `${id} checkout installed`, stderr: "" };
}

export async function installApt(context: PackageContext, names: string, reinstall = false): Promise<CommandResult> {
  const apt = context.host.packageManagers.apt;
  return apt ? context.run("sudo", [apt, "install", "-y", ...(reinstall ? ["--reinstall"] : []), ...names.split(" ")]) : { code: 1, stdout: "", stderr: "APT is unavailable" };
}

/** Run `brew <verb>` for a catalog package name such as `ripgrep` or `--cask nikitabobko/tap/aerospace`. */
export async function brewPackageCommand(context: PackageContext, verb: "install" | "upgrade" | "reinstall", packageName: string): Promise<CommandResult> {
  const brew = context.host.packageManagers.brew;
  if (!brew) return { code: 1, stdout: "", stderr: "Homebrew is unavailable" };
  const args = packageName.split(" ");
  const result = await context.run(brew, [verb, ...args], { env: { HOMEBREW_NO_AUTO_UPDATE: "1" } });
  // A reinstall does not restore links another formula or a stray file took over.
  if (result.code === 0 && verb === "reinstall" && args[0] !== "--cask") await context.run(brew, ["link", "--overwrite", ...args], { quiet: true });
  return result;
}

/** The pinned artifact for this host, or undefined when no pin exists and the install must refuse. */
function releasePin(context: PackageContext, id: string, pins: DownloadPins = downloadPins): ArchivePin | undefined {
  return pinFor(pins, id, context.host.platform, context.host.architecture);
}

/** Verify and unpack the pinned archive, then publish its members at `destinationFor`; `verify` runs after publication and any failure restores the previous files. */
async function installPinnedArchive(context: PackageContext, pin: ArchivePin, destinationFor: (member: string) => string, verify: () => Promise<void>): Promise<CommandResult> {
  const directory = await mkdtemp(join(tmpdir(), "setup-pinned-"));
  try {
    const unpacked = await unpackPinnedArchive(context, pin, directory);
    await publishExecutables(context, pin.members.map(member => ({ source: join(unpacked, member), destination: destinationFor(member) })), verify);
    return { code: 0, stdout: "installed and verified", stderr: "" };
  } catch (error) { return { code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) }; }
  finally { await rm(directory, { recursive: true, force: true }); }
}

/** Install a pinned single-binary release as ~/.local/bin/<id>; its version probe gates the publish. */
async function installPinnedRelease(context: PackageContext, id: string, pins: DownloadPins): Promise<CommandResult> {
  const pin = releasePin(context, id, pins);
  if (!pin) return { code: 1, stdout: "", stderr: `No pinned ${id} release for ${context.host.platform}-${context.host.architecture}.` };
  const destination = join(context.home, ".local/bin", id);
  return installPinnedArchive(context, pin, () => destination, () => requireVersionProbe(context, destination, id));
}

async function requireVersionProbe(context: PackageContext, executable: string, name: string, env: Record<string, string> = {}): Promise<void> {
  const probe = await context.run(executable, ["--version"], { quiet: true, env });
  if (probe.code !== 0) throw new Error(`${name} release failed its version probe`);
}

/** Publish a downloaded binary as ~/.local/bin/<name>; a replaced file goes to the backup tree and is restored if the version probe fails. */
export async function placeUserExecutable(context: PackageContext, binary: string, name: string): Promise<string> {
  const destination = join(context.home, ".local/bin", name);
  await publishExecutables(context, [{ source: binary, destination }], () => requireVersionProbe(context, destination, name));
  return destination;
}

export async function inspectPackage(context: PackageContext, id: string): Promise<SoftwareState> {
  return inspectSoftware(context, id);
}

const voltaEnv = (context: PackageContext): { VOLTA_HOME: string } => ({ VOLTA_HOME: process.env.VOLTA_HOME ?? join(context.home, ".volta") });

async function inspectVolta(context: PackageContext): Promise<SoftwareState> {
  if (await executableHealthy(context, "volta")) return { installed: true, healthy: true };
  if (!releasePin(context, "volta")) return { installed: false, healthy: false, reason: `No pinned Volta release for ${context.host.platform}-${context.host.architecture}.` };
  if (!commandFor(context.host, "curl") || !commandFor(context.host, "tar")) return { installed: false, healthy: false, reason: "curl and tar are required to install the pinned Volta archive." };
  return { installed: false, healthy: false, route: "github-release" };
}

/** Publish Volta's pinned binaries into $VOLTA_HOME/bin; the installed `volta` must answer --version before the install counts. Setup and shell profiles are never touched. */
async function installVolta(context: PackageContext, pins: DownloadPins): Promise<CommandResult> {
  const pin = releasePin(context, "volta", pins);
  if (!pin) return { code: 1, stdout: "", stderr: `No pinned Volta release for ${context.host.platform}-${context.host.architecture}.` };
  const env = voltaEnv(context);
  const bin = join(env.VOLTA_HOME, "bin");
  return installPinnedArchive(context, pin, member => join(bin, member), () => requireVersionProbe(context, join(bin, "volta"), "volta", env));
}

async function inspectNodeLts(context: PackageContext): Promise<SoftwareState> {
  const volta = commandFor(context.host, "volta");
  if (volta) {
    const defaults = await context.run(volta, ["list", "node", "--default", "--format", "plain"], { quiet: true, env: voltaEnv(context) });
    if (defaults.code === 0 && /^runtime node@\S+/m.test(defaults.stdout)) return { installed: true, healthy: true };
  }
  return { installed: false, healthy: false, route: "volta-node" };
}

export async function installRecipe(context: PackageContext, id: string, pins: DownloadPins = downloadPins): Promise<CommandResult> {
  if (id === "node-lts") {
    const state = await inspectNodeLts(context);
    if (state.installed) return { code: 0, stdout: "Volta already provides a default Node runtime", stderr: "" };
    const volta = commandFor(context.host, "volta");
    if (!volta) return { code: 1, stdout: "", stderr: "Volta is required to install Node LTS; select Volta first." };
    return context.run(volta, ["install", "node"], { env: voltaEnv(context) });
  }
  if (id === "volta") {
    const state = await inspectVolta(context);
    if (state.installed) return { code: 0, stdout: "volta is already healthy", stderr: "" };
    if (!state.route) return { code: 1, stdout: "", stderr: state.reason ?? "Volta cannot be installed." };
    return installVolta(context, pins);
  }
  if (id === "nerd-font") return installGeistFont(context, pins);
  const state = await inspectSoftware(context, id);
  if (state.route === "brew-upgrade" && state.packageName) return brewPackageCommand(context, "upgrade", state.packageName);
  if (state.installed) return { code: 0, stdout: `${id} is already healthy`, stderr: "" };
  if (state.reason && !state.route) return { code: 1, stdout: "", stderr: state.reason };
  if (state.route === "brew" && state.packageName) return brewPackageCommand(context, "install", state.packageName);
  if (state.route === "brew-reinstall" && state.packageName) return brewPackageCommand(context, "reinstall", state.packageName);
  if ((state.route === "apt" || state.route === "apt-reinstall") && state.packageName) return installApt(context, state.packageName, state.route === "apt-reinstall");
  if (state.route === "git-checkout" && (id === "fzf" || id === "zsh-abbr")) return installCheckout(context, id);
  if (state.route === "github-release") return installPinnedRelease(context, id, pins);
  return { code: 1, stdout: "", stderr: state.reason ?? `Recipe for ${id} requires its dedicated source adapter` };
}

const styles = ["Regular", "Bold", "Italic"] as const;
const family = "GeistMono Nerd Font Mono";
function hasExactFace(familyField: string, styleField: string, expected: string): boolean {
  const names = familyField.split(/[;,]/).map(value => value.trim());
  return names.includes(family) && styleField.split(/[;,]/).some(value => value.trim().toLowerCase() === expected.toLowerCase());
}

// Reads family/face names straight from the font files through CoreText, then asks the font
// service which faces it has activated. A file in ~/Library/Fonts is not enough: when that
// directory is created after fontd started (a fresh account), fontd never activates its fonts and
// Alacritty falls back to Menlo. `register` activates the files persistently for the user.
const coreTextFaces = `ObjC.import("AppKit"); ObjC.import("CoreText");
function run(argv) {
  const [mode, family, ...paths] = argv;
  if (mode === "register") {
    // 2 = kCTFontManagerScopeUser: persistent for this user. JXA bridges the named constant as a string.
    for (const path of paths) $.CTFontManagerRegisterFontsForURL($.NSURL.fileURLWithPath(path), 2, null);
    return "";
  }
  const out = [];
  for (const path of paths) {
    const descriptors = $.CTFontManagerCreateFontDescriptorsFromURL($.NSURL.fileURLWithPath(path));
    if (!descriptors) continue;
    const list = ObjC.castRefToObject(descriptors);
    for (let index = 0; index < list.count; index++) {
      const descriptor = list.objectAtIndex(index);
      out.push("file\\t" + ObjC.unwrap(descriptor.objectForKey("NSFontFamilyAttribute")) + "\\t" + ObjC.unwrap(descriptor.objectForKey("NSFontFaceAttribute")) + "\\t" + path);
    }
  }
  for (const member of ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableMembersOfFontFamily(family)) ?? []) out.push("active\\t" + family + "\\t" + member[1]);
  return out.join("\\n");
}`;
interface MacFontState { complete: boolean; active: boolean; files: string[]; detail: string }
async function inspectMacFonts(context: PackageContext): Promise<MacFontState> {
  const osascript = commandFor(context.host, "osascript");
  if (!osascript) return { complete: false, active: false, files: [], detail: "osascript is unavailable" };
  const files: string[] = [];
  for (const directory of [join(context.host.home, "Library/Fonts"), "/Library/Fonts"]) {
    for (const name of await readdir(directory).catch(() => [] as string[])) if (/^GeistMono.*\.(?:otf|ttf)$/i.test(name)) files.push(join(directory, name));
  }
  if (!files.length) return { complete: false, active: false, files, detail: "no GeistMono font files in ~/Library/Fonts or /Library/Fonts" };
  const result = await context.run(osascript, ["-l", "JavaScript", "-e", coreTextFaces, "inspect", family, ...files], { quiet: true });
  if (result.code !== 0) return { complete: false, active: false, files: [], detail: "CoreText font inspection failed" };
  const found = new Set<string>(), active = new Set<string>(), familyFiles: string[] = [];
  for (const line of result.stdout.split("\n")) {
    const [kind = "", families = "", face = "", path = ""] = line.trim().split("\t");
    const match = styles.find(style => hasExactFace(families, face, style));
    if (kind === "file" && families.split(/[;,]/).some(name => name.trim() === family)) familyFiles.push(path);
    if (match) (kind === "active" ? active : found).add(match);
  }
  const complete = styles.every(style => found.has(style));
  const inactive = styles.filter(style => !active.has(style));
  return { complete, active: complete && !inactive.length, files: familyFiles, detail: complete ? `macOS has not activated the installed ${inactive.join(", ")} faces` : `valid faces: ${[...found].join(", ")}` };
}

/** Activate installed font files for the current user, then confirm macOS serves every required face. */
async function activateMacFonts(context: PackageContext): Promise<CommandResult> {
  const state = await inspectMacFonts(context);
  if (!state.active && state.complete) await context.run(commandFor(context.host, "osascript")!, ["-l", "JavaScript", "-e", coreTextFaces, "register", family, ...state.files], { quiet: true });
  const verified = state.active ? state : await inspectMacFonts(context);
  return verified.active
    ? { code: 0, stdout: "Installed and activated Geist Mono Nerd Font Mono faces", stderr: "" }
    : { code: 1, stdout: "", stderr: `Geist Mono Nerd Font Mono could not be activated (${verified.detail}); open the files in Font Book to install them.` };
}

async function inspectLinuxFonts(context: PackageContext): Promise<{ complete: boolean; detail: string }> {
  const fcList = commandFor(context.host, "fc-list");
  if (!fcList) return { complete: false, detail: "fontconfig is required; install it with your distribution's package manager, then rerun." };
  const result = await context.run(fcList, ["--format", "%{family}\\t%{style}\\t%{file}\\n"], { quiet: true });
  if (result.code !== 0) return { complete: false, detail: "fontconfig font enumeration failed" };
  const found = new Set<string>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [families = "", style = "", file = ""] = line.split("\t");
    if (!file) continue;
    try { await stat(file); } catch { continue; }
    const match = styles.find(item => hasExactFace(families, style, item));
    if (match) found.add(match);
  }
  const matcher = commandFor(context.host, "fc-match");
  if (matcher) for (const style of styles) {
    const matched = await context.run(matcher, ["-f", "%{family}\\t%{style}\\t%{file}\\n", `${family}:style=${style}`], { quiet: true });
    const [families = "", actualStyle = "", file = ""] = matched.stdout.trim().split("\t");
    if (matched.code !== 0 || !file || !hasExactFace(families, actualStyle, style) || !found.has(style)) found.delete(style);
  }
  return { complete: styles.every(style => found.has(style)), detail: `valid faces: ${[...found].join(", ")}` };
}

async function inspectFontconfigRoute(context: PackageContext): Promise<SoftwareState> {
  const apt = context.host.packageManagers.apt;
  if (apt) {
    const installed = await aptInstalled(context, "fontconfig");
    if (installed) return { installed: false, healthy: false, reason: "fontconfig is installed but its required commands are unavailable; reinstalling it.", route: "apt-fontconfig", packageName: "--reinstall fontconfig" };
    if (await aptCandidate(context, "fontconfig")) return { installed: false, healthy: false, route: "apt-fontconfig", packageName: "fontconfig" };
  }
  const brew = context.host.packageManagers.brew;
  if (brew) {
    if (await brewInstalled(context, "fontconfig")) return { installed: false, healthy: false, reason: "fontconfig is installed by Homebrew but its required commands are unavailable; reinstalling it.", route: "brew-fontconfig", packageName: "fontconfig" };
    const info = await context.run(brew, ["info", "--json=v2", "fontconfig"], { quiet: true });
    if (info.code === 0) try {
      const data = JSON.parse(info.stdout) as { formulae?: Array<{ name?: string }> };
      if (data.formulae?.some((formula) => formula.name === "fontconfig")) return { installed: false, healthy: false, route: "brew-fontconfig", packageName: "fontconfig" };
    } catch { /* Invalid Homebrew metadata cannot establish a supported route. */ }
  }
  return { installed: false, healthy: false, reason: "fontconfig's fc-list, fc-match, and fc-cache commands are required; no supported APT or Homebrew route is available." };
}

export async function inspectGeistFont(context: PackageContext): Promise<SoftwareState> {
  if (context.host.platform === "linux" && ["fc-list", "fc-match", "fc-cache"].some(name => !commandFor(context.host, name))) return inspectFontconfigRoute(context);
  if (context.host.platform === "darwin") {
    const result = await inspectMacFonts(context);
    if (result.active) return { installed: true, healthy: true };
    if (result.complete) return { installed: false, healthy: false, route: "font-activate", reason: result.detail };
    const brew = context.host.packageManagers.brew;
    if (brew) {
      if (await brewInstalled(context, "font-geist-mono-nerd-font")) return { installed: false, healthy: false, route: "brew-reinstall", packageName: "--cask font-geist-mono-nerd-font", reason: `Installed Geist Mono Nerd Font cask has incomplete faces (${result.detail}); reinstalling it.` };
      if (await brewCaskEnabled(context, "font-geist-mono-nerd-font")) return { installed: false, healthy: false, route: "brew", packageName: "--cask font-geist-mono-nerd-font" };
    }
    if (!commandFor(context.host, "curl") || !commandFor(context.host, "tar")) return { installed: false, healthy: false, reason: "curl and tar are required for the official Geist Mono Nerd Font release route." };
    return { installed: false, healthy: false, route: "font-download", reason: result.detail };
  }
  const result = await inspectLinuxFonts(context);
  if (result.complete) return { installed: true, healthy: true };
  return { installed: false, healthy: false, route: "font-download", reason: result.detail };
}

export async function installGeistFont(context: PackageContext, pins: DownloadPins = downloadPins): Promise<CommandResult> {
  const state = await inspectGeistFont(context);
  if (state.installed) return { code: 0, stdout: "Exact Geist Mono Nerd Font faces already installed", stderr: "" };
  if (state.route === "apt-fontconfig" || state.route === "brew-fontconfig") {
    const installed = state.route === "apt-fontconfig"
      ? await installApt(context, state.packageName ?? "fontconfig")
      : await brewPackageCommand(context, await brewInstalled(context, "fontconfig") ? "reinstall" : "install", "fontconfig");
    if (installed.code !== 0) return installed;
    await context.refreshHost?.();
    const refreshed = await inspectGeistFont(context);
    if (refreshed.route === "apt-fontconfig" || refreshed.route === "brew-fontconfig" || !refreshed.route) return { code: 1, stdout: "", stderr: refreshed.reason ?? "Fontconfig commands remain unavailable after installation." };
  }
  if (state.route === "font-activate") return activateMacFonts(context);
  if ((state.route === "brew" || state.route === "brew-reinstall") && state.packageName) {
    const installed = await brewPackageCommand(context, state.route === "brew" ? "install" : "reinstall", state.packageName);
    return installed.code === 0 ? activateMacFonts(context) : installed;
  }
  const curl = commandFor(context.host, "curl");
  const tar = commandFor(context.host, "tar");
  const fcList = commandFor(context.host, "fc-list");
  const fcMatch = commandFor(context.host, "fc-match");
  const fcCache = commandFor(context.host, "fc-cache");
  const missing = [!curl && "curl", !tar && "tar", context.host.platform === "linux" && !fcList && "fc-list", context.host.platform === "linux" && !fcMatch && "fc-match", context.host.platform === "linux" && !fcCache && "fc-cache"].filter(Boolean);
  if (missing.length) return { code: 1, stdout: "", stderr: `Required font installation commands are missing: ${missing.join(", ")}` };
  const pin = releasePin(context, "nerd-font", pins);
  if (!pin) return { code: 1, stdout: "", stderr: `No pinned Nerd Font release for ${context.host.platform}-${context.host.architecture}.` };
  const work = await mkdtemp(join(tmpdir(), "geist-nerd-font-"));
  const placed: Array<{ destination: string; backup?: string }> = [];
  try {
    const unpacked = await unpackPinnedArchive(context, pin, work);
    const all = await readdir(unpacked);
    const faces = all.filter(name => /^GeistMonoNerdFontMono-.*\.otf$/.test(name));
    const target = context.host.platform === "darwin" ? join(context.host.home, "Library/Fonts") : join(process.env.XDG_DATA_HOME ?? join(context.host.home, ".local/share"), "fonts", `GeistMono-v${pin.version}`);
    await mkdir(target, { recursive: true });
    const changes: Array<{ source: string; destination: string; existing: boolean; backup?: string }> = [];
    for (const face of faces) {
      const source = join(unpacked, face), destination = join(target, basename(face));
      const previous = await readFile(destination).catch(() => undefined);
      if (previous && previous.equals(await readFile(source))) continue;
      const exists = await lstat(destination).then(() => true).catch(() => false);
      if (exists && !context.backupUserFile) throw new Error(`Cannot safely replace ${destination}; no user-file backup adapter is available.`);
      changes.push({ source, destination, existing: exists });
    }
    for (const change of changes) {
      const backup = change.existing ? await context.backupUserFile!(change.destination) : undefined;
      placed.push({ destination: change.destination, ...(backup ? { backup } : {}) });
      await copyFile(change.source, change.destination);
    }
    if (context.host.platform === "darwin") {
      const activated = await activateMacFonts(context);
      if (activated.code !== 0) throw new Error(activated.stderr);
    }
    if (changes.length && context.host.platform === "linux") {
      const cache = await context.run(fcCache!, ["-f", target]);
      if (cache.code !== 0) throw new Error(`fontconfig cache refresh failed: ${cache.stderr}`);
    }
    const verify = await inspectGeistFont(context);
    if (!verify.installed) throw new Error(`Installed font faces could not be verified (${verify.reason ?? "incomplete family"}); use Font Book or inspect fontconfig`);
    return { code: 0, stdout: "Installed and verified Geist Mono Nerd Font Mono faces", stderr: "" };
  } catch (error) {
    for (const item of placed.reverse()) {
      await rm(item.destination, { force: true }).catch(() => undefined);
      if (item.backup) await rename(item.backup, item.destination).catch(() => undefined);
    }
    return { code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  } finally { await rm(work, { recursive: true, force: true }); }
}
