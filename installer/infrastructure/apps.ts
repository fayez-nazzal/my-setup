import { constants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CommandResult, PackageContext, SoftwareState } from "./packages";
import { aptInstalled, brewCaskEnabled, brewInstalled, brewPackageCommand, healthyState, installApt, latestGithubRelease, placeUserExecutable } from "./packages";
import type { Platform } from "./host";
import { downloadVerified } from "./downloads";

/** Apps with their own inspect/install routes per OS and CPU (the rest of the software list lives in packages.ts). */
export const appIds: ReadonlySet<string> = new Set(["obsidian", "gh", "google-chrome", "orbstack", "amphetamine"]);
/** Routes that elevate with sudo; the CLI authenticates once before running them (mas asks sudo itself otherwise). */
export const appSudoRoutes: ReadonlySet<string> = new Set(["obsidian-deb", "obsidian-tar", "gh-apt", "amphetamine-mas"]);
const obsidianAppBinary = (platform: Platform) => platform === "darwin" ? "/Applications/Obsidian.app/Contents/MacOS/Obsidian" : "/opt/Obsidian/obsidian";
const done = (stdout: string): CommandResult => ({ code: 0, stdout, stderr: "" });
const fail = (stderr: string): CommandResult => ({ code: 1, stdout: "", stderr });
const exe = (c: PackageContext, name: string) => c.host.executables.get(name);
const isExecutable = (path: string) => access(path, constants.X_OK).then(() => true, () => false);
const debArch = (c: PackageContext) => c.host.architecture === "x64" ? "amd64" : "arm64";
const hasApt = (c: PackageContext) => Boolean(c.host.packageManagers.apt && c.host.packageManagers.dpkgQuery);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const missing = (c: PackageContext, names: readonly string[]) => names.filter(name => !exe(c, name));

/** A macOS app from a Homebrew cask: installed when its binary runs, upgraded when Homebrew reports it outdated. */
async function macCaskApp(c: PackageContext, cask: string, binary: string, label: string): Promise<SoftwareState> {
  if (await isExecutable(binary)) return healthyState(c, `--cask ${cask}`);
  if (c.host.packageManagers.brew && await brewCaskEnabled(c, cask)) return { installed: false, healthy: false, route: await brewInstalled(c, cask) ? "brew-reinstall" : "brew", packageName: `--cask ${cask}` };
  return { installed: false, healthy: false, reason: `${label} installs through Homebrew; rerun install.sh and accept the Homebrew bootstrap.` };
}

async function withWorkspace(prefix: string, work: (directory: string) => Promise<CommandResult>): Promise<CommandResult> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try { return await work(directory); }
  catch (error) { return fail(message(error)); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function download(c: PackageContext, url: string, destination: string): Promise<void> {
  const fetched = await c.run(exe(c, "curl")!, ["-fsSL", "--retry", "2", "-o", destination, url], { quiet: true });
  if (fetched.code !== 0) throw new Error(`Download failed: ${url}${fetched.stderr.trim() ? ` (${fetched.stderr.trim()})` : ""}`);
}
async function fetchJson(c: PackageContext, url: string): Promise<unknown> {
  const response = await c.run(exe(c, "curl")!, ["-fsSL", "--retry", "2", url], { quiet: true });
  if (response.code !== 0) throw new Error(`Could not fetch ${url}`);
  return JSON.parse(response.stdout);
}
/** A string property of parsed JSON, or undefined when the shape differs. */
function field(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const found: unknown = Reflect.get(value, key);
  return typeof found === "string" ? found : undefined;
}
async function sudo(c: PackageContext, args: readonly string[], failure: string): Promise<void> {
  const result = await c.run("sudo", args);
  if (result.code !== 0) throw new Error(failure);
}

interface GithubAsset { url: string; digest: string }
/** Asset URL plus the SHA-256 digest GitHub publishes for it; releases without digests are refused. */
async function githubAsset(c: PackageContext, repository: string, tag: string, name: string): Promise<GithubAsset> {
  const release = await fetchJson(c, `https://api.github.com/repos/${repository}/releases/tags/${tag}`);
  const assets: unknown = release && typeof release === "object" && "assets" in release ? release.assets : undefined;
  const asset = Array.isArray(assets) ? assets.find((item: unknown) => field(item, "name") === name) : undefined;
  const url = field(asset, "browser_download_url"), digest = field(asset, "digest");
  if (!url) throw new Error(`${repository} ${tag} has no ${name} asset.`);
  if (!digest?.startsWith("sha256:")) throw new Error(`${repository} ${tag} publishes no SHA-256 digest for ${name}.`);
  return { url, digest: digest.slice("sha256:".length) };
}
async function findDirectoryWith(root: string, file: string): Promise<string> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && await access(join(root, entry.name, file)).then(() => true, () => false)) return join(root, entry.name);
  }
  throw new Error(`Archive has no ${file}.`);
}

interface AptRepository { label: string; host: string; key: { url: string; fingerprint: string; armored: boolean }; keyring: string; list: string; line(arch: string): string }
const githubCliRepository: AptRepository = {
  label: "GitHub CLI", host: "cli.github.com/packages",
  key: { url: "https://cli.github.com/packages/githubcli-archive-keyring.gpg", fingerprint: "2C6106201985B60E6C7AC87323F3D4EA75716059", armored: false },
  keyring: "/etc/apt/keyrings/githubcli-archive-keyring.gpg", list: "/etc/apt/sources.list.d/github-cli.list",
  line: arch => `deb [arch=${arch} signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main`,
};

/** Another APT source already serving the repository (user-made or deb822) must not be duplicated: apt rejects conflicting Signed-By values. */
async function aptSourceElsewhere(repository: AptRepository): Promise<boolean> {
  const files = ["/etc/apt/sources.list", ...(await readdir("/etc/apt/sources.list.d").catch(() => [] as string[])).map(name => join("/etc/apt/sources.list.d", name))];
  for (const file of files) {
    if (file === repository.list) continue;
    if ((await readFile(file, "utf8").catch(() => "")).split("\n").some(line => !line.trim().startsWith("#") && line.includes(repository.host))) return true;
  }
  return false;
}

/** Install the vendor's signed APT source exactly as documented upstream, verifying the key fingerprint first; a no-op when already present. */
export async function ensureAptRepository(c: PackageContext, repository: AptRepository): Promise<"changed" | "unchanged"> {
  const line = `${repository.line(debArch(c))}\n`;
  const ours = await readFile(repository.list, "utf8").catch(() => undefined);
  const keyringPresent = await access(repository.keyring).then(() => true, () => false);
  if ((ours === line && keyringPresent) || (ours === undefined && await aptSourceElsewhere(repository))) return "unchanged";
  if (!exe(c, "gpg")) {
    const installed = await installApt(c, "gnupg");
    if (installed.code !== 0) throw new Error(`gnupg is required to verify the ${repository.label} APT key and could not be installed.`);
    await c.refreshHost?.();
    if (!exe(c, "gpg")) throw new Error("gpg is still unavailable after installing gnupg.");
  }
  const result = await withWorkspace("my-setup-apt-", async workspace => {
    const gpg = exe(c, "gpg")!;
    const env = { GNUPGHOME: join(workspace, "gnupg") }; await mkdir(env.GNUPGHOME, { mode: 0o700 });
    const downloaded = join(workspace, "key");
    await download(c, repository.key.url, downloaded);
    const shown = await c.run(gpg, ["--batch", "--with-colons", "--show-keys", downloaded], { quiet: true, env });
    const primary = shown.stdout.split("\n").find(row => row.startsWith("fpr:"))?.split(":")[9];
    if (shown.code !== 0 || primary !== repository.key.fingerprint) throw new Error(`The ${repository.label} APT key fingerprint is ${primary ?? "unreadable"}, expected ${repository.key.fingerprint}.`);
    const keyring = join(workspace, "keyring.gpg");
    if (repository.key.armored) {
      if ((await c.run(gpg, ["--batch", "--yes", "--dearmor", "--output", keyring, downloaded], { quiet: true, env })).code !== 0) throw new Error(`Could not dearmor the ${repository.label} key.`);
    } else await writeFile(keyring, await readFile(downloaded));
    const list = join(workspace, basename(repository.list));
    await writeFile(list, line);
    await sudo(c, ["install", "-d", "-m", "0755", dirname(repository.keyring), dirname(repository.list)], `Could not create APT directories for ${repository.label}.`);
    await sudo(c, ["install", "-m", "0644", keyring, repository.keyring], `Could not install ${repository.keyring}.`);
    await sudo(c, ["install", "-m", "0644", list, repository.list], `Could not install ${repository.list}.`);
    // Refresh only this source; the rest of the system's package lists stay as they are.
    await sudo(c, [c.host.packageManagers.apt!, "update", "-o", `Dir::Etc::sourcelist=${repository.list}`, "-o", "Dir::Etc::sourceparts=-", "-o", "APT::Get::List-Cleanup=0"], `apt-get update failed for the ${repository.label} repository.`);
    return done("repository added");
  });
  if (result.code !== 0) throw new Error(result.stderr);
  return "changed";
}

async function aptRepositoryInstall(c: PackageContext, repository: AptRepository, pkg: string): Promise<CommandResult> {
  try {
    const configured = await ensureAptRepository(c, repository);
    if (configured === "unchanged" && !await aptInstalled(c, pkg)) {
      const source = await access(repository.list).then(() => ["-o", `Dir::Etc::sourcelist=${repository.list}`, "-o", "Dir::Etc::sourceparts=-"], () => []);
      await sudo(c, [c.host.packageManagers.apt!, "update", ...source, "-o", "APT::Get::List-Cleanup=0"], `apt-get update failed for the ${repository.label} repository.`);
    }
  } catch (error) { return fail(message(error)); }
  return installApt(c, pkg, Boolean(await aptInstalled(c, pkg)));
}

// ── Obsidian ────────────────────────────────────────────────────────────────

async function inspectObsidian(c: PackageContext): Promise<SoftwareState> {
  if (c.host.platform === "darwin") return macCaskApp(c, "obsidian", obsidianAppBinary("darwin"), "Obsidian");
  const incomplete = await access("/opt/Obsidian/.my-setup-installing").then(() => true, () => false);
  if (!incomplete && (await isExecutable(obsidianAppBinary("linux")) || exe(c, "obsidian"))) return { installed: true, healthy: true };
  if (missing(c, ["curl"]).length) return { installed: false, healthy: false, reason: "Obsidian's release routes require curl." };
  // Upstream ships a .deb for amd64 only; ARM64 and non-APT hosts use the release tarball.
  if (hasApt(c) && c.host.architecture === "x64") return { installed: false, healthy: false, route: "obsidian-deb", reason: "Latest amd64 .deb release" };
  if (missing(c, ["tar"]).length) return { installed: false, healthy: false, reason: "Obsidian's tarball route requires tar." };
  return { installed: false, healthy: false, route: "obsidian-tar", reason: `Latest ${debArch(c)} release tarball into /opt/Obsidian` };
}

const obsidianDesktopEntry = `[Desktop Entry]
Name=Obsidian
Comment=Obsidian
Exec=/opt/Obsidian/obsidian %U
Icon=/opt/Obsidian/resources/icon.png
Terminal=false
Type=Application
StartupWMClass=obsidian
MimeType=x-scheme-handler/obsidian;
Categories=Office;
`;

async function installObsidian(c: PackageContext, state: SoftwareState): Promise<CommandResult> {
  if (state.route !== "obsidian-deb" && state.route !== "obsidian-tar") return fail(state.reason ?? "No supported Obsidian route.");
  return withWorkspace("my-setup-obsidian-", async workspace => {
    const version = field(await fetchJson(c, "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json"), "latestVersion");
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Obsidian release metadata is invalid.");
    const name = state.route === "obsidian-deb" ? `obsidian_${version}_amd64.deb` : `obsidian-${version}${c.host.architecture === "arm64" ? "-arm64" : ""}.tar.gz`;
    const file = join(workspace, name);
    await downloadVerified(c, await githubAsset(c, "obsidianmd/obsidian-releases", `v${version}`, name), file);
    await chmod(workspace, 0o755); // apt's sandbox user must be able to read a local .deb.
    if (state.route === "obsidian-deb") {
      const installed = await installApt(c, file);
      return installed.code === 0 ? done(`Obsidian ${version} installed`) : installed;
    }
    const unpacked = join(workspace, "unpacked"); await mkdir(unpacked);
    if ((await c.run(exe(c, "tar")!, ["-xzf", file, "-C", unpacked], { quiet: true })).code !== 0) throw new Error("Could not unpack the Obsidian tarball.");
    const source = await findDirectoryWith(unpacked, "obsidian");
    if (await access("/opt/Obsidian").then(() => true, () => false)) await sudo(c, ["mv", "/opt/Obsidian", `/opt/Obsidian.replaced-${Date.now()}`], "Could not move the incomplete /opt/Obsidian aside.");
    await sudo(c, ["mkdir", "-p", "/opt/Obsidian"], "Could not create /opt/Obsidian.");
    await sudo(c, ["touch", "/opt/Obsidian/.my-setup-installing"], "Could not mark the Obsidian installation as incomplete.");
    await sudo(c, ["cp", "-a", `${source}/.`, "/opt/Obsidian/"], "Could not copy Obsidian into /opt/Obsidian.");
    await sudo(c, ["chown", "-R", "root:root", "/opt/Obsidian"], "Could not hand /opt/Obsidian to root.");
    // Electron's setuid sandbox helper, as the .deb installs it; without it Obsidian refuses to start on hardened kernels.
    await sudo(c, ["chmod", "4755", "/opt/Obsidian/chrome-sandbox"], "Could not set the Obsidian chrome-sandbox permissions.");
    await sudo(c, ["mkdir", "-p", "/usr/local/bin", "/usr/local/share/applications"], "Could not create /usr/local directories.");
    await sudo(c, ["ln", "-sfn", "/opt/Obsidian/obsidian", "/usr/local/bin/obsidian"], "Could not link /usr/local/bin/obsidian.");
    const entry = join(workspace, "obsidian.desktop");
    await writeFile(entry, obsidianDesktopEntry);
    await sudo(c, ["install", "-m", "0644", entry, "/usr/local/share/applications/obsidian.desktop"], "Could not install the Obsidian desktop entry.");
    await sudo(c, ["rm", "/opt/Obsidian/.my-setup-installing"], "Could not mark the Obsidian installation as complete.");
    return done(`Obsidian ${version} installed in /opt/Obsidian`);
  });
}

// ── GitHub CLI ──────────────────────────────────────────────────────────────

async function inspectGh(c: PackageContext): Promise<SoftwareState> {
  const gh = exe(c, "gh");
  if (gh && (await c.run(gh, ["--version"], { quiet: true })).code === 0) return healthyState(c, "gh");
  if (c.host.platform === "darwin" && c.host.packageManagers.brew) {
    if (await brewInstalled(c, "gh")) return { installed: false, healthy: false, route: "brew-reinstall", packageName: "gh", reason: "Homebrew's gh is installed but unhealthy; reinstalling it." };
    return { installed: false, healthy: false, route: "brew", packageName: "gh" };
  }
  if (c.host.platform === "linux" && hasApt(c)) return { installed: false, healthy: false, route: "gh-apt", packageName: "gh", reason: "GitHub's signed APT repository" };
  const absent = missing(c, ["curl", c.host.platform === "darwin" ? "unzip" : "tar"]);
  return absent.length ? { installed: false, healthy: false, reason: `The GitHub CLI release route requires ${absent.join(", ")}.` } : { installed: false, healthy: false, route: "gh-release", reason: "Latest GitHub CLI release into ~/.local/bin" };
}

async function installGh(c: PackageContext, state: SoftwareState): Promise<CommandResult> {
  if (state.route === "gh-apt") return aptRepositoryInstall(c, githubCliRepository, "gh");
  if (state.route !== "gh-release") return fail(state.reason ?? "No supported GitHub CLI route.");
  return withWorkspace("my-setup-gh-", async workspace => {
    const tag = await latestGithubRelease(c, "cli/cli");
    if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Could not determine the latest GitHub CLI release.");
    const version = tag.slice(1);
    const stem = c.host.platform === "darwin" ? `gh_${version}_macOS_${debArch(c)}` : `gh_${version}_linux_${debArch(c)}`;
    const name = `${stem}${c.host.platform === "darwin" ? ".zip" : ".tar.gz"}`;
    const archive = join(workspace, name);
    await downloadVerified(c, await githubAsset(c, "cli/cli", tag, name), archive);
    const unpacked = join(workspace, "unpacked"); await mkdir(unpacked);
    const extracted = c.host.platform === "darwin" ? await c.run(exe(c, "unzip")!, ["-q", archive, "-d", unpacked], { quiet: true }) : await c.run(exe(c, "tar")!, ["-xzf", archive, "-C", unpacked], { quiet: true });
    if (extracted.code !== 0) throw new Error("Could not unpack the GitHub CLI release.");
    await placeUserExecutable(c, join(unpacked, stem, "bin/gh"), "gh");
    return done(`GitHub CLI ${version} installed in ~/.local/bin`);
  });
}

// ── macOS-only apps: Google Chrome, OrbStack (Homebrew casks), Amphetamine (App Store through Homebrew's mas) ──

export const amphetamineApp = "/Applications/Amphetamine.app";
/** Amphetamine's App Store id; it has no Homebrew cask. */
const amphetamineStoreId = "937984704";

async function inspectChrome(c: PackageContext): Promise<SoftwareState> {
  return macCaskApp(c, "google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "Google Chrome");
}
async function inspectOrbStack(c: PackageContext): Promise<SoftwareState> {
  return macCaskApp(c, "orbstack", "/Applications/OrbStack.app/Contents/MacOS/OrbStack", "OrbStack");
}

async function inspectAmphetamine(c: PackageContext): Promise<SoftwareState> {
  if (await isExecutable(join(amphetamineApp, "Contents/MacOS/Amphetamine"))) return { installed: true, healthy: true };
  if (!c.host.packageManagers.brew) return { installed: false, healthy: false, reason: "Amphetamine installs from the App Store through Homebrew's mas; rerun install.sh and accept the Homebrew bootstrap." };
  return { installed: false, healthy: false, route: "amphetamine-mas", reason: "App Store install through Homebrew's mas (sign in to the App Store first)" };
}

async function installAmphetamine(c: PackageContext, state: SoftwareState): Promise<CommandResult> {
  if (state.route !== "amphetamine-mas") return fail(state.reason ?? "No supported Amphetamine route.");
  let mas = exe(c, "mas");
  if (!mas) {
    const installed = await brewPackageCommand(c, "install", "mas");
    if (installed.code !== 0) return installed;
    await c.refreshHost?.();
    mas = exe(c, "mas");
    if (!mas) return fail("Homebrew installed mas, but it is not on PATH.");
  }
  // `get` installs free apps, including ones this Apple Account has never downloaded.
  const got = await c.run(mas, ["get", amphetamineStoreId]);
  return got.code === 0 ? done("Amphetamine installed from the App Store") : fail("mas could not install Amphetamine. Sign in to the App Store app, then rerun.");
}

// ── Dispatch ────────────────────────────────────────────────────────────────

const inspectors: Record<string, (c: PackageContext) => Promise<SoftwareState>> = { obsidian: inspectObsidian, gh: inspectGh, "google-chrome": inspectChrome, orbstack: inspectOrbStack, amphetamine: inspectAmphetamine };
const installers: Record<string, (c: PackageContext, state: SoftwareState) => Promise<CommandResult>> = { obsidian: installObsidian, gh: installGh, amphetamine: installAmphetamine };

export function inspectApp(c: PackageContext, id: string): Promise<SoftwareState> {
  const inspect = inspectors[id];
  if (!inspect) throw new Error(`Unknown app ${id}`);
  return inspect(c);
}

export async function installApp(c: PackageContext, id: string): Promise<CommandResult> {
  const state = await inspectApp(c, id);
  if (state.route === "brew-upgrade" && state.packageName) return brewPackageCommand(c, "upgrade", state.packageName);
  if (state.installed) return done(`${id} is already installed`);
  if ((state.route === "brew" || state.route === "brew-reinstall") && state.packageName) return brewPackageCommand(c, state.route === "brew" ? "install" : "reinstall", state.packageName);
  const install = installers[id];
  return install ? install(c, state) : fail(state.reason ?? `No supported route for ${id}.`);
}
