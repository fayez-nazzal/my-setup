import { constants, access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { RecipeContext, SoftwareState, CommandResult } from "./packages";
import { installApt } from "./packages";
import type { ToolResult } from "./tools";

export const runtimeIds: ReadonlySet<string> = new Set(["aws-cli", "corretto21"]);
export const runtimeSudoRoutes: ReadonlySet<string> = new Set(["aws-official", "corretto-apt", "corretto-cask"]);
const result = (code = 0, stdout = "", stderr = ""): CommandResult => ({ code, stdout, stderr });
const executable = (c: RecipeContext, key: string) => c.host.executables.get(key);
const exists = async (path: string) => access(path).then(() => true, () => false);
const fail = (text: string) => result(1, "", text);
const homeCandidates = (c: RecipeContext) => [
  ...(process.env.JAVA_HOME ? [process.env.JAVA_HOME] : []),
  ...(c.host.platform === "darwin" ? [join(c.home, "Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home")] : []),
  ...(c.host.platform === "darwin" ? ["/Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home", "/Library/Java/JavaVirtualMachines/amazon-corretto-21-aarch64.jdk/Contents/Home"] : ["/usr/lib/jvm/java-21-amazon-corretto", "/usr/lib/jvm/amazon-corretto-21"]),
];

async function verifiedCorrettoHome(c: RecipeContext): Promise<string | undefined> {
  for (const home of homeCandidates(c)) {
    try {
      const release = await readFile(join(home, "release"), "utf8");
      const version = release.match(/^JAVA_VERSION="([^"]+)"/m)?.[1];
      const vendor = release.match(/^IMPLEMENTOR="([^"]+)"/m)?.[1];
      if (!version?.startsWith("21.") || !vendor || !/Amazon\.com Inc\.|Amazon Corretto/i.test(vendor)) continue;
      await access(join(home, "bin/java"), constants.X_OK);
      await access(join(home, "bin/javac"), constants.X_OK);
      const java = await c.run(join(home, "bin/java"), ["-version"], { quiet: true });
      const javac = await c.run(join(home, "bin/javac"), ["-version"], { quiet: true });
      if (java.code !== 0 || !/version "21[."]/.test(java.stdout + java.stderr) || !/Corretto/i.test(java.stdout + java.stderr) || javac.code !== 0 || !/^javac 21[.\s]/.test(javac.stdout + javac.stderr)) continue;
      return home;
    } catch { /* candidate absent */ }
  }
}
async function awsHealthy(c: RecipeContext): Promise<boolean> {
  const aws = executable(c, "aws");
  if (!aws) return false;
  const found = await c.run(aws, ["--version"], { quiet: true });
  return found.code === 0 && /aws-cli\/2\./.test(found.stdout + found.stderr);
}
function supportedLinux(c: RecipeContext, id: string): boolean {
  const apt = Boolean(c.host.packageManagers.apt && c.host.packageManagers.dpkgQuery);
  return id === "corretto21" ? apt : apt || ["curl", "gpg", "unzip"].every(name => executable(c, name));
}
export async function inspectRuntime(c: RecipeContext, id: string): Promise<SoftwareState> {
  if (!runtimeIds.has(id)) return { installed: false, healthy: false, reason: `Unknown runtime: ${id}` };
  const brew = executable(c, "brew");
  if (id === "aws-cli") {
    if (await awsHealthy(c)) return { installed: true, healthy: true };
    if (c.host.platform === "darwin" && brew) return { installed: false, healthy: false, route: "brew", packageName: "awscli" };
    return { installed: false, healthy: false, route: c.host.platform === "linux" && supportedLinux(c, id) && ["x64", "arm64"].includes(c.host.architecture) ? "aws-official" : undefined, reason: "AWS CLI installation requires Homebrew on macOS, or curl/gpg/unzip (bootstrapped through APT when available) on Linux amd64/arm64." };
  }
  const corretto = await verifiedCorrettoHome(c);
  if (corretto) return { installed: true, healthy: true };
  if (c.host.platform === "darwin" && brew) return { installed: false, healthy: false, route: "corretto-cask", packageName: "corretto@21" };
  return { installed: false, healthy: false, route: c.host.platform === "linux" && supportedLinux(c, id) && ["x64", "arm64"].includes(c.host.architecture) ? "corretto-apt" : undefined, reason: "Amazon Corretto JDK 21 installation requires Homebrew on macOS, or APT on Linux amd64/arm64." };
}
async function brew(c: RecipeContext, pkg: string, cask = false): Promise<CommandResult> {
  const b = executable(c, "brew");
  return b ? c.run(b, ["install", ...(cask ? ["--cask"] : []), pkg], { env: { HOMEBREW_NO_AUTO_UPDATE: "1" } }) : fail("Homebrew is unavailable");
}
async function withWorkspace(work: (workspace: string) => Promise<CommandResult>): Promise<CommandResult> {
  const workspace = await mkdtemp(join(tmpdir(), "my-setup-runtime-"));
  try { return await work(workspace); }
  catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
  finally { await rm(workspace, { recursive: true, force: true }); }
}
async function download(c: RecipeContext, url: string, destination: string): Promise<void> {
  const curl = executable(c, "curl");
  if (!curl || (await c.run(curl, ["-fsSL", "--retry", "2", "-o", destination, url], { quiet: true })).code !== 0) throw new Error(`Could not download ${url}`);
}
async function verifyGpg(c: RecipeContext, workspace: string, key: string, fingerprint: string, signature: string, file: string): Promise<boolean> {
  const gpg = executable(c, "gpg");
  if (!gpg) return false;
  const home = join(workspace, "gnupg");
  await mkdir(home, { mode: 0o700 });
  const env = { GNUPGHOME: home };
  const shown = await c.run(gpg, ["--batch", "--with-colons", "--show-keys", key], { quiet: true, env });
  if (shown.code !== 0 || shown.stdout.split("\n").find(row => row.startsWith("fpr:"))?.split(":")[9] !== fingerprint) return false;
  if ((await c.run(gpg, ["--batch", "--quiet", "--import", key], { quiet: true, env })).code !== 0) return false;
  const checked = await c.run(gpg, ["--batch", "--status-fd", "1", "--verify", signature, file], { quiet: true, env });
  return checked.code === 0 && checked.stdout.split("\n").some(line => line.startsWith("[GNUPG:] VALIDSIG ") && line.trim().endsWith(fingerprint));
}
async function installAwsLinux(c: RecipeContext): Promise<CommandResult> {
  const arch = c.host.architecture === "x64" ? "x86_64" : "aarch64";
  const curl = executable(c, "curl")!, unzip = executable(c, "unzip")!;
  return withWorkspace(async workspace => {
    const url = `https://awscli.amazonaws.com/awscli-exe-linux-${arch}.zip`;
    const archive = join(workspace, "awscliv2.zip"), signature = join(workspace, "awscliv2.sig"), key = join(workspace, "aws-key.asc");
    await download(c, url, archive);
    await download(c, `${url}.sig`, signature);
    const documentation = await c.run(curl, ["-fsSL", "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"], { quiet: true });
    const keyBlock = documentation.stdout.match(/-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/)?.[0];
    if (documentation.code !== 0 || !keyBlock) return fail("Could not retrieve the AWS CLI signing key from the official AWS installation guide.");
    await writeFile(key, `${keyBlock}\n`);
    if (!(await verifyGpg(c, workspace, key, "FB5DB77FD5C118B80511ADA8A6310ACC4672475C", signature, archive))) return fail("AWS CLI archive signature did not verify against the pinned AWS CLI Team key.");
    const unpacked = await c.run(unzip, ["-q", archive, "-d", workspace]);
    if (unpacked.code !== 0) return unpacked;
    return c.run("sudo", [join(workspace, "aws/install"), "--update"]);
  });
}
const correttoRepo = { host: "apt.corretto.aws", keyUrl: "https://apt.corretto.aws/corretto.key", fingerprint: "6DC3636DAE534049C8B94623A122542AB04F24E3", keyring: "/usr/share/keyrings/corretto-archive-keyring.gpg", list: "/etc/apt/sources.list.d/corretto.list" };
async function installCorrettoLinux(c: RecipeContext): Promise<CommandResult> {
  const architecture = c.host.architecture === "x64" ? "amd64" : "arm64";
  const apt = c.host.packageManagers.apt!;
  return withWorkspace(async workspace => {
    const key = join(workspace, "corretto.key");
    await download(c, correttoRepo.keyUrl, key);
    const gpg = executable(c, "gpg")!;
    const home = join(workspace, "gnupg"); await mkdir(home, { mode: 0o700 });
    const env = { GNUPGHOME: home };
    const shown = await c.run(gpg, ["--batch", "--with-colons", "--show-keys", key], { quiet: true, env });
    if (shown.code !== 0 || shown.stdout.split("\n").find(row => row.startsWith("fpr:"))?.split(":")[9] !== correttoRepo.fingerprint) return fail("Corretto repository key fingerprint did not match the pinned AWS key.");
    const keyring = join(workspace, "corretto.gpg");
    if ((await c.run(gpg, ["--batch", "--yes", "--dearmor", "--output", keyring, key], { quiet: true, env })).code !== 0) return fail("Could not dearmor Corretto repository key.");
    const list = join(workspace, basename(correttoRepo.list));
    await writeFile(list, `deb [arch=${architecture} signed-by=${correttoRepo.keyring}] https://${correttoRepo.host} stable main\n`);
    const existing = await readFile(correttoRepo.list, "utf8").catch(() => undefined);
    if (existing && existing !== await readFile(list, "utf8")) return fail(`Refusing to overwrite existing APT source ${correttoRepo.list}.`);
    if (!existing) {
      const sourceDirs = ["/etc/apt/sources.list", ...(await readdir("/etc/apt/sources.list.d").catch(() => [] as string[])).map(file => join("/etc/apt/sources.list.d", file))];
      for (const source of sourceDirs) if ((await readFile(source, "utf8").catch(() => "")).split("\n").some(line => !line.trim().startsWith("#") && line.includes(correttoRepo.host))) return fail("Another APT source already serves apt.corretto.aws; refusing a conflicting duplicate.");
    }
    const installed = await c.run("sudo", ["install", "-d", "-m", "0755", dirname(correttoRepo.keyring), dirname(correttoRepo.list)]);
    if (installed.code !== 0) return installed;
    const putKey = await c.run("sudo", ["install", "-m", "0644", keyring, correttoRepo.keyring]); if (putKey.code !== 0) return putKey;
    if (!existing) { const putList = await c.run("sudo", ["install", "-m", "0644", list, correttoRepo.list]); if (putList.code !== 0) return putList; }
    const update = await c.run("sudo", [apt, "update", "-o", `Dir::Etc::sourcelist=${correttoRepo.list}`, "-o", "Dir::Etc::sourceparts=-", "-o", "APT::Get::List-Cleanup=0"]);
    if (update.code !== 0) return update;
    return c.run("sudo", [apt, "install", "-y", "java-21-amazon-corretto-jdk"]);
  });
}
export async function installRuntime(c: RecipeContext, id: string): Promise<CommandResult> {
  if (!runtimeIds.has(id)) return fail(`Unknown runtime: ${id}`);
  const state = await inspectRuntime(c, id);
  if (state.installed && state.healthy) return result(0, `${id} already installed`);
  if (!state.route) return fail(state.reason ?? "No supported installation route is available.");
  if (c.host.platform === "linux") {
    const missing = (id === "aws-cli" ? ["curl", "gpg", "unzip"] : ["curl", "gpg"]).filter(name => !executable(c, name));
    if (missing.length) {
      const installed = await installApt(c, missing.map(name => name === "gpg" ? "gnupg" : name).join(" "));
      if (installed.code !== 0) return installed;
      await c.refreshHost?.();
      if (missing.some(name => !executable(c, name))) return fail("Runtime prerequisites were installed but are not available on PATH.");
    }
  }
  if (id === "aws-cli") return c.host.platform === "darwin" ? brew(c, "awscli") : installAwsLinux(c);
  return c.host.platform === "darwin" ? brew(c, "corretto@21", true) : installCorrettoLinux(c);
}
export async function configureJavaHome(c: RecipeContext): Promise<ToolResult> {
  const expected = await verifiedCorrettoHome(c);
  if (!expected) return { id: "java-home", status: "blocked", attention: ["Amazon Corretto JDK 21 must be installed and verified before JAVA_HOME can be configured."] };
  const profile = join(c.repoRoot, "zsh/.config/zsh/profile.d/30-java-home.zsh");
  if (!(await exists(profile))) return { id: "java-home", status: "failed", attention: [`Tracked JAVA_HOME profile snippet is missing: ${profile}`] };
  const zsh = executable(c, "zsh");
  if (!zsh) return { id: "java-home", status: "blocked", attention: ["zsh is required to verify JAVA_HOME in a login shell."] };
  const checked = await c.run(zsh, ["-lc", "printf '%s\\n%s' \"$JAVA_HOME\" \"$(command -v java)\""], { quiet: true });
  const [actualHome, javaPath] = checked.stdout.split("\n");
  if (checked.code !== 0 || actualHome !== expected || javaPath !== join(expected, "bin/java")) return { id: "java-home", status: "failed", attention: ["The zsh login profile did not set JAVA_HOME and PATH to the verified Amazon Corretto 21 JDK."] };
  return { id: "java-home", status: "unchanged", attention: [] };
}
