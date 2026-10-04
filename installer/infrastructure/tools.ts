import { constants } from "node:fs";
import { access, copyFile, chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { aerospaceApp, aerospaceRepository, brewPackageCommand, fullXcodeDeveloperDir, latestGithubRelease } from "./packages";
import type { RecipeContext } from "./packages";
import { ensureSudo } from "./commands";
export type { RecipeContext };
export type RecipeStatus = "changed" | "unchanged" | "blocked" | "failed";
export interface ToolResult { id: string; status: RecipeStatus; attention: string[]; }
const ok = (id: string, status: RecipeStatus = "changed", ...attention: string[]): ToolResult => ({ id, status, attention });
const executable = (c: RecipeContext, name: string) => c.host.executables.get(name);
const exists = async (path: string) => {
  try { await access(path); return true; } catch { return false; }
};
const executableFile = async (path: string) => {
  try { await access(path, constants.X_OK); return true; } catch { return false; }
};
const hasTmuxEntrypoint = async (directory: string) => {
  try { return (await readdir(directory)).some(name => name.endsWith(".tmux")); } catch { return false; }
};
const run = async (c: RecipeContext, id: string, command: string, args: string[], options?: Parameters<RecipeContext["run"]>[2]) => {
  const result = await c.run(command, args, options);
  if (result.code === 0) return ok(id);
  const cause = result.stderr.trim().split("\n").at(-1);
  return ok(id, "failed", `${command} ${args.join(" ")} failed (exit ${result.code})${cause ? `: ${cause}` : ""}.`);
};

export async function installZshAbbr(c: RecipeContext): Promise<ToolResult> {
  const target = join(c.home, ".config/zsh-abbr");
  if (executable(c, "zsh-abbr") || await exists(join(target, "zsh-abbr.zsh"))) return ok("zsh-abbr", "unchanged");
  if (await exists(target)) return ok("zsh-abbr", "blocked", `${target} exists but is not a healthy zsh-abbr checkout; move it aside manually.`);
  const brew = executable(c, "brew");
  if (brew) {
    const info = await c.run(brew, ["info", "--json=v2", "olets/tap/zsh-abbr"]);
    if (info.code === 0 && info.stdout) {
      let supported = false;
      try {
        const metadata = JSON.parse(info.stdout);
        const formula = metadata.formulae?.find((item: { name?: string; full_name?: string }) => item.full_name === "olets/tap/zsh-abbr" || item.name === "zsh-abbr");
        supported = Boolean(formula && !formula.disabled);
      } catch { /* Fall through to the documented source checkout. */ }
      if (supported) {
        const installed = await c.run(brew, ["list", "--formula", "--versions", "olets/tap/zsh-abbr"]);
        if (installed.code === 0 && installed.stdout?.trim()) return ok("zsh-abbr", "failed", "Homebrew reports zsh-abbr installed but its executable/configuration is missing; repair the installation manually.");
        return run(c, "zsh-abbr", brew, ["install", "olets/tap/zsh-abbr"], { env: { HOMEBREW_NO_AUTO_UPDATE: "1" } });
      }
    }
  }
  if (!executable(c, "git")) return ok("zsh-abbr", "blocked", "zsh-abbr needs git for the upstream source route.");
  await mkdir(join(c.home, ".config"), { recursive: true });
  const result = await run(c, "zsh-abbr", executable(c, "git") ?? "git", ["clone", "--quiet", "--recurse-submodules", "--single-branch", "--branch", "main", "--depth", "1", "https://github.com/olets/zsh-abbr", target]);
  if (result.status === "changed" && !(await exists(join(target, "zsh-abbr.zsh")))) return ok("zsh-abbr", "failed", "Clone completed without a readable zsh-abbr.zsh.");
  return result;
}

export async function installTmuxscope(c: RecipeContext): Promise<ToolResult> {
  const dir = join(c.home, "repos/tools/tmuxscope");
  const dist = join(dir, "dist/tmuxscope");
  const userBin = join(c.home, ".local/bin/tmuxscope");
  const git = executable(c, "git");
  // A tmuxscope installed some other way is left alone; the managed checkout is kept current.
  if (executable(c, "tmuxscope") && !await exists(join(dir, ".git"))) return ok("tmuxscope", "unchanged");
  let updated = false;
  if (await exists(dir)) {
    const stat = await lstat(dir);
    if (!stat.isDirectory()) return ok("tmuxscope", "blocked", `${dir} exists and is not a directory; move it aside manually.`);
    if (git && await exists(join(dir, ".git"))) {
      const branch = await c.run(git, ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { quiet: true });
      const dirty = await c.run(git, ["-C", dir, "status", "--porcelain", "--untracked-files=no"], { quiet: true });
      // Only fast-forward a clean main checkout so local work is never touched.
      if (branch.stdout.trim() === "main" && dirty.code === 0 && !dirty.stdout.trim()) {
        const before = await c.run(git, ["-C", dir, "rev-parse", "HEAD"], { quiet: true });
        await c.run(git, ["-C", dir, "pull", "--quiet", "--ff-only", "origin", "main"], { quiet: true });
        updated = (await c.run(git, ["-C", dir, "rev-parse", "HEAD"], { quiet: true })).stdout !== before.stdout;
      }
    }
  } else {
    if (!git) return ok("tmuxscope", "blocked", "tmuxscope needs git to clone its source checkout.");
    await mkdir(join(c.home, "repos/tools"), { recursive: true });
    const cloned = await run(c, "tmuxscope", git, ["clone", "--quiet", "--single-branch", "--branch", "main", "https://github.com/fayez-nazzal/tmuxscope.git", dir]);
    if (cloned.status !== "changed") return cloned;
  }
  let distHealthy = !updated && await executableFile(dist);
  if (distHealthy) distHealthy = (await c.run(dist, ["--version"], { quiet: true })).code === 0;
  if (!distHealthy) {
    if (!executable(c, "bun")) return ok("tmuxscope", "blocked", "Bun is required to build tmuxscope.");
    const install = await run(c, "tmuxscope", executable(c, "bun")!, ["install"], { cwd: dir });
    if (install.status !== "changed") return install;
    const build = await run(c, "tmuxscope", executable(c, "bun")!, ["run", "build"], { cwd: dir });
    if (build.status !== "changed") return build;
  }
  if (!await executableFile(dist) || (await c.run(dist, ["--version"])).code !== 0) return ok("tmuxscope", "failed", "tmuxscope build output is missing or failed its version probe.");
  await mkdir(join(c.home, ".local/bin"), { recursive: true });
  const linked = await c.ensureLink(dist, userBin);
  return ok("tmuxscope", linked);
}

const conf = (path: string) => {
  try { return readFile(path, "utf8"); } catch { return Promise.resolve(""); }
};
async function pluginDeclarations(repoRoot: string): Promise<string[]> {
  const text = await conf(join(repoRoot, ".tmux.conf"));
  return [...text.matchAll(/set(?:-option)?\s+-g\s+@plugin\s+["']([^"']+)["']/g)].map(m => m[1]!);
}
export async function installTmuxPlugins(c: RecipeContext): Promise<ToolResult> {
  const home = c.home;
  const tpm = join(home, ".tmux/plugins/tpm");
  const installer = join(tpm, "bin/install_plugins");
  const declarations = await pluginDeclarations(c.repoRoot);
  if (!declarations.length) return ok("tmux-plugins", "blocked", "No plugin declarations were found in the repository .tmux.conf.");
  let complete = await executableFile(join(tpm, "tpm")) && await executableFile(installer);
  for (const declaration of declarations) {
    const name = declaration.split("/").at(-1)!;
    if (name === "tpm") continue;
    if (!await hasTmuxEntrypoint(join(home, ".tmux/plugins", name))) complete = false;
  }
  if (complete) return ok("tmux-plugins", "unchanged");
  for (const declaration of declarations) {
    const name = declaration.split("/").at(-1)!;
    if (name === "tpm") continue;
    const plugin = join(home, ".tmux/plugins", name);
    if (await exists(plugin) && !await hasTmuxEntrypoint(plugin)) return ok("tmux-plugins", "blocked", `${plugin} exists without a plugin entrypoint; preserve it and repair the checkout manually.`);
  }
  if (!executable(c, "git")) return ok("tmux-plugins", "blocked", "git is required to clone TPM.");
  if (!await exists(tpm)) {
    await mkdir(join(home, ".tmux/plugins"), { recursive: true });
    const cloned = await run(c, "tmux-plugins", executable(c, "git") ?? "git", ["clone", "--quiet", "https://github.com/tmux-plugins/tpm", tpm]);
    if (cloned.status !== "changed") return cloned;
  }
  if (!await executableFile(join(tpm, "tpm")) || !await executableFile(installer)) return ok("tmux-plugins", "blocked", `TPM checkout at ${tpm} is incomplete; repair it manually.`);
  const tmux = executable(c, "tmux");
  if (!tmux) return ok("tmux-plugins", "blocked", "tmux is required to install its plugins.");
  const socket = `my_setup_installer_${process.pid}`;
  const scratch = await mkdtemp(join(tmpdir(), "my-setup-tpm-"));
  const wrapper = join(scratch, "bin");
  const configBefore = await readFile(join(c.repoRoot, "tmux/tmux-scopes.conf")).catch(() => undefined);
  const isolatedConfig = join(scratch, "tmux-scopes.conf");
  try {
    await mkdir(wrapper);
    await writeFile(join(wrapper, "tmux"), `#!/bin/sh\nexec ${JSON.stringify(tmux)} -L ${JSON.stringify(socket)} "$@"\n`, { mode: 0o700 });
    await writeFile(isolatedConfig, "# isolated installer plugin run\n", { mode: 0o600 });
    const server = await c.run(tmux, ["-L", socket, "-f", join(c.repoRoot, ".tmux.conf"), "new-session", "-d", "-s", "bootstrap", "-x", "80", "-y", "24"], { env: { PATH: `${wrapper}:${process.env.PATH ?? ""}`, TMUXSCOPE_CONFIG: isolatedConfig } });
    if (server.code !== 0) return ok("tmux-plugins", "failed", `Could not initialize the isolated tmux server (exit ${server.code}).`);
    const result = await c.run(installer, [], { env: { PATH: `${wrapper}:${process.env.PATH ?? ""}`, TMUXSCOPE_CONFIG: isolatedConfig } });
    if (result.code !== 0) return ok("tmux-plugins", "failed", `TPM plugin install failed (exit ${result.code}); run ${installer} inside a real tmux session.`);
    for (const declaration of declarations) {
      const name = declaration.split("/").at(-1)!;
      if (name !== "tpm" && !await hasTmuxEntrypoint(join(home, ".tmux/plugins", name))) return ok("tmux-plugins", "failed", `TPM did not install a healthy plugin entrypoint for ${declaration}.`);
    }
    return ok("tmux-plugins");
  } finally {
    await c.run(tmux, ["-L", socket, "kill-server"]).catch(() => undefined);
    await rm(join(process.env.TMUX_TMPDIR ?? "/tmp", `tmux-${process.getuid?.() ?? ""}`, socket), { force: true }).catch(() => undefined);
    const after = await readFile(join(c.repoRoot, "tmux/tmux-scopes.conf")).catch(() => undefined);
    await rm(scratch, { recursive: true, force: true });
    if ((configBefore || after) && (!configBefore || !after || !after.equals(configBefore))) throw new Error("TPM changed tracked tmux/tmux-scopes.conf despite isolation; manual review is required.");
  }
}

export async function installAlacrittySource(c: RecipeContext): Promise<ToolResult> {
  if (c.host.platform !== "darwin") return ok("alacritty", "blocked", "The Alacritty source recipe is macOS-only.");
  const brew = executable(c, "brew");
  const required = ["clang", "make", "tic", "gzip", "codesign", "cargo", "rustc", "scdoc", "xcode-select", "git", "curl", "tar"];
  const missing = required.filter(x => !executable(c, x));
  if (missing.includes("clang") || missing.includes("make") || missing.includes("xcode-select")) return ok("alacritty", "blocked", "Install Xcode command-line tools with xcode-select --install, then rerun.");
  const absentSystemTools = missing.filter(name => ["tic", "gzip", "codesign"].includes(name));
  if (absentSystemTools.length) return ok("alacritty", "blocked", `Alacritty source build requires ${absentSystemTools.join(", ")}; install Xcode command-line tools and ensure those tools are available.`);
  if (!executable(c, "cargo") || !executable(c, "rustc") || !executable(c, "scdoc")) {
    if (!brew) return ok("alacritty", "blocked", `Missing source-build prerequisites: ${missing.filter(x => ["cargo", "rustc", "scdoc"].includes(x)).join(", ")}; Homebrew or all prerequisites are required.`);
    for (const pkg of ["rust", "scdoc"]) {
      if ((pkg === "rust" && executable(c, "cargo") && executable(c, "rustc")) || (pkg === "scdoc" && executable(c, "scdoc"))) continue;
      const r = await brewPackageCommand(c, "install", pkg);
      if (r.code !== 0) return ok("alacritty", "failed", `Could not install missing ${pkg} build prerequisite.`);
    }
    await c.refreshHost?.();
  }
  const developerDir = await c.run(executable(c, "xcode-select") ?? "xcode-select", ["-p"], { quiet: true });
  if (developerDir.code !== 0) return ok("alacritty", "blocked", "Install Xcode command-line tools with xcode-select --install, then rerun.");
  if (!executable(c, "git") || !executable(c, "curl")) return ok("alacritty", "blocked", "The Alacritty source route requires git and curl.");
  const tag = await latestGithubRelease(c, "alacritty/alacritty");
  if (!tag) return ok("alacritty", "failed", "Could not look up the latest stable Alacritty release.");
  // Update the app where it already lives; fresh installs go where casks put apps.
  const destination = /^(.*\.app)\/Contents\/MacOS\/alacritty$/.exec(executable(c, "alacritty") ?? "")?.[1] ?? "/Applications/Alacritty.app";
  const temp = join(c.home, `.my-setup-alacritty-${process.pid}`);
  try {
    const clone = await run(c, "alacritty", executable(c, "git") ?? "git", ["clone", "--quiet", "--depth", "1", "--branch", tag, "https://github.com/alacritty/alacritty.git", temp]);
    if (clone.status !== "changed") return clone;
    const manifest = await readFile(join(temp, "Cargo.toml"), "utf8").catch(() => "");
    const msrv = /^rust-version\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m.exec(manifest);
    const requiredVersion = msrv ? msrv.slice(1).map(Number) : [1, 85, 0];
    const rustTooOld = async () => {
      const compiler = await c.run(executable(c, "rustc")!, ["--version"], { quiet: true });
      const current = /rustc\s+(\d+)\.(\d+)\.(\d+)/.exec(compiler.stdout)?.slice(1).map(Number);
      if (!current) return true;
      const delta = current.map((value, index) => value - requiredVersion[index]!).find(value => value !== 0) ?? 0;
      return delta < 0;
    };
    if (await rustTooOld()) {
      // Update whichever manager owns rustc; never swap in a different toolchain manager.
      const rustup = executable(c, "rustup");
      if (rustup) await c.run(rustup, ["update", "stable"]);
      else if (brew && executable(c, "rustc")!.startsWith(dirname(dirname(brew)))) await brewPackageCommand(c, "upgrade", "rust");
      await c.refreshHost?.();
      if (await rustTooOld()) return ok("alacritty", "blocked", `Alacritty ${tag} requires Rust ${requiredVersion.join(".")}, and the installed rustc could not be updated by its manager.`);
    }
    const build = await run(c, "alacritty", executable(c, "make") ?? "make", ["app"], { cwd: temp });
    if (build.status !== "changed") return build;
    const app = join(temp, "target/release/osx/Alacritty.app");
    const binary = join(app, "Contents/MacOS/alacritty");
    if (!await exists(binary)) return ok("alacritty", "failed", "Alacritty build output is missing its app executable.");
    const check = await c.run(binary, ["--version"]);
    if (check.code !== 0) return ok("alacritty", "failed", "Built Alacritty executable failed its version check.");
    const placed = await installAppBundle(c, app, destination);
    if (placed) return ok("alacritty", "failed", placed);
    const infocmp = executable(c, "infocmp");
    if (!infocmp || (await c.run(infocmp, ["alacritty"], { quiet: true })).code !== 0) {
      const tic = await c.run(executable(c, "tic") ?? "tic", ["-xe", "alacritty,alacritty-direct", "-o", join(c.home, ".terminfo"), join(temp, "extra/alacritty.info")], { cwd: temp });
      if (tic.code !== 0) return ok("alacritty", "failed", "App installed, but Alacritty terminfo could not be installed.");
    }
    return ok("alacritty");
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Replace an app bundle via a sibling stage; uses sudo only when the parent directory is not writable. Returns an error message. */
async function installAppBundle(c: RecipeContext, built: string, destination: string): Promise<string | undefined> {
  const writable = await access(dirname(destination), constants.W_OK).then(() => true, () => false);
  if (!writable && !await ensureSudo()) return `${dirname(destination)} is not writable and administrator access was declined.`;
  const exec = (args: string[]) => writable ? c.run(args[0]!, args.slice(1)) : c.run("sudo", args);
  const stage = `${destination}.stage-${process.pid}`;
  await exec(["/bin/rm", "-rf", stage]);
  if ((await exec(["/usr/bin/ditto", built, stage])).code !== 0) { await exec(["/bin/rm", "-rf", stage]); return `Could not stage ${built} next to ${destination}.`; }
  if ((await exec(["/bin/rm", "-rf", destination])).code !== 0 || (await exec(["/bin/mv", stage, destination])).code !== 0) { await exec(["/bin/rm", "-rf", stage]); return `Could not replace ${destination}.`; }
  return undefined;
}

/** Copy a single build output file over a user-owned destination through a sibling stage file. */
async function placeFile(source: string, destination: string, mode: number): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const stage = `${destination}.stage-${process.pid}`;
  await copyFile(source, stage);
  await chmod(stage, mode);
  await rename(stage, destination);
}

const aerospaceIdentity = "aerospace-codesign-certificate";
/**
 * AeroSpace's release build signs with this self-signed identity so macOS keeps the Accessibility
 * grant across rebuilds. Created once in the login keychain; macOS asks for the keychain password
 * once so codesign can use the key without a dialog per build.
 */
async function ensureAerospaceIdentity(c: RecipeContext): Promise<string | undefined> {
  const security = "/usr/bin/security";
  const identities = await c.run(security, ["find-identity", "-p", "codesigning"], { quiet: true });
  if (identities.stdout.includes(`"${aerospaceIdentity}"`)) return undefined;
  const keychain = (await c.run(security, ["default-keychain", "-d", "user"], { quiet: true })).stdout.trim().replace(/^"|"$/g, "") || join(c.home, "Library/Keychains/login.keychain-db");
  const work = await mkdtemp(join(tmpdir(), "aerospace-identity-"));
  try {
    await writeFile(join(work, "identity.cnf"), `[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=${aerospaceIdentity}\n[v3]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n`, { mode: 0o600 });
    const password = crypto.randomUUID();
    const steps: string[][] = [
      ["/usr/bin/openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "3650", "-keyout", join(work, "key.pem"), "-out", join(work, "cert.pem"), "-config", join(work, "identity.cnf")],
      ["/usr/bin/openssl", "pkcs12", "-export", "-inkey", join(work, "key.pem"), "-in", join(work, "cert.pem"), "-out", join(work, "identity.p12"), "-name", aerospaceIdentity, "-passout", `pass:${password}`],
      [security, "import", join(work, "identity.p12"), "-k", keychain, "-P", password, "-T", "/usr/bin/codesign"],
    ];
    for (const [command, ...args] of steps) if ((await c.run(command!, args, { quiet: true })).code !== 0) return `Could not create the ${aerospaceIdentity} signing identity (${command} ${args[0]}).`;
    console.log(`Allowing codesign to use the new ${aerospaceIdentity} key; enter your login keychain password (usually your login password) if asked.`);
    if ((await c.run(security, ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-l", aerospaceIdentity, keychain], { quiet: true })).code !== 0) console.log("Keychain access was not pre-approved; macOS will ask once during the build — choose Always Allow.");
    return undefined;
  } finally { await rm(work, { recursive: true, force: true }); }
}

/** Build AeroSpace from the latest main branch with upstream's release script and install it like the cask does. */
export async function installAerospaceSource(c: RecipeContext): Promise<ToolResult> {
  const id = "aerospace";
  const brew = executable(c, "brew"), git = executable(c, "git");
  if (c.host.platform !== "darwin" || !brew || !git) return ok(id, "blocked", "The AeroSpace source build needs macOS, Homebrew, and git.");
  const developerDir = await fullXcodeDeveloperDir(c);
  if (!developerDir) return ok(id, "blocked", "The AeroSpace source build needs full Xcode; install Xcode from the App Store, then rerun.");
  const xcodebuild = join(developerDir, "usr/bin/xcodebuild");
  const xcodeEnv = { DEVELOPER_DIR: developerDir };
  for (const [check, fix] of [[["-license", "check"], ["-license", "accept"]], [["-checkFirstLaunchStatus"], ["-runFirstLaunch"]]] as const) {
    if ((await c.run(xcodebuild, check, { quiet: true, env: xcodeEnv })).code === 0) continue;
    if (!await ensureSudo()) return ok(id, "blocked", `Xcode needs \`sudo xcodebuild ${fix.join(" ")}\`; administrator access was declined.`);
    if ((await c.run("sudo", ["/usr/bin/env", `DEVELOPER_DIR=${developerDir}`, xcodebuild, ...fix])).code !== 0) return ok(id, "failed", `sudo xcodebuild ${fix.join(" ")} failed.`);
  }
  const source = join(c.home, ".cache/my-setup/AeroSpace");
  if (await exists(join(source, ".git"))) {
    // Installer-owned build cache: discard local state but keep downloaded build tools (.deps) and SwiftPM state (.build).
    for (const args of [["fetch", "--quiet", "--depth", "1", "origin", "main"], ["reset", "--quiet", "--hard", "FETCH_HEAD"], ["clean", "-ffdxq", "-e", ".deps", "-e", ".build"]]) {
      const step = await run(c, id, git, ["-C", source, ...args]);
      if (step.status !== "changed") return step;
    }
  } else {
    await rm(source, { recursive: true, force: true });
    await mkdir(dirname(source), { recursive: true });
    const cloned = await run(c, id, git, ["clone", "--quiet", "--depth", "1", "--branch", "main", aerospaceRepository, source]);
    if (cloned.status !== "changed") return cloned;
  }
  // Upstream build prerequisites: bash 5, swiftly, Ruby 3 for the docs, fish and Rust for shell completions.
  const gemfile = await readFile(join(source, "Gemfile"), "utf8").catch(() => "");
  const rubyMajor = /^ruby\s+['"]~>\s*(\d+)\./m.exec(gemfile)?.[1] ?? "3";
  const rubyInfo = await c.run(brew, ["info", "--json=v2", "ruby"], { quiet: true });
  let ruby = "ruby";
  try { if (!(JSON.parse(rubyInfo.stdout).formulae?.[0]?.versions?.stable ?? "").startsWith(`${rubyMajor}.`)) ruby = ""; } catch { ruby = ""; }
  if (!ruby) {
    const formulae = (await c.run(brew, ["formulae"], { quiet: true })).stdout.split("\n").filter(name => new RegExp(`^ruby@${rubyMajor}\\.\\d+$`).test(name.trim()));
    ruby = formulae.map(name => name.trim()).sort((left, right) => Number(right.split(".")[1]) - Number(left.split(".")[1]))[0] ?? "";
    if (!ruby) return ok(id, "failed", `Homebrew has no Ruby ${rubyMajor}.x formula for AeroSpace's documentation build.`);
  }
  const prerequisites = ["bash", "swiftly", ruby, "fish", ...(executable(c, "cargo") ? [] : ["rust"])];
  const listed = new Set((await c.run(brew, ["list", "--formula", "-1"], { quiet: true })).stdout.split("\n").map(name => name.trim()));
  for (const pkg of prerequisites) {
    if (listed.has(pkg)) continue;
    if ((await brewPackageCommand(c, "install", pkg)).code !== 0) return ok(id, "failed", `Could not install the ${pkg} AeroSpace build prerequisite.`);
  }
  const prefix = dirname(dirname(brew));
  const swiftly = join(prefix, "bin/swiftly");
  if (!await exists(join(process.env.SWIFTLY_HOME_DIR ?? join(c.home, ".swiftly"), "config.json"))) {
    const init = await run(c, id, swiftly, ["init", "--assume-yes", "--no-modify-profile", "--skip-install", "--quiet-shell-followup"]);
    if (init.status !== "changed") return init;
  }
  const toolchain = await run(c, id, swiftly, ["install", "--assume-yes"], { cwd: source });
  if (toolchain.status !== "changed") return toolchain;
  const identity = await ensureAerospaceIdentity(c);
  if (identity) return ok(id, "failed", identity);
  const buildPath = [join(prefix, "opt", ruby, "bin"), join(prefix, "bin"), join(c.home, ".cargo/bin"), process.env.PATH ?? ""].join(":");
  const build = await run(c, id, join(prefix, "bin/bash"), ["./build-release.sh", "--codesign-identity", aerospaceIdentity], { cwd: source, env: { PATH: buildPath, DEVELOPER_DIR: developerDir } });
  if (build.status !== "changed") return build;
  const release = join(source, ".release");
  if ((await c.run(join(release, "aerospace"), ["--version"], { quiet: true })).code !== 0) return ok(id, "failed", "The built aerospace CLI failed its version probe.");
  // Swap the app in place: quit a running instance, retire the cask so it cannot shadow the build, relaunch after.
  const osascript = executable(c, "osascript") ?? "/usr/bin/osascript";
  await c.run(osascript, ["-e", 'if application id "bobko.aerospace" is running then tell application id "bobko.aerospace" to quit'], { quiet: true });
  const casks = (await c.run(brew, ["list", "--cask", "-1"], { quiet: true })).stdout.split("\n").map(name => name.trim());
  if (casks.includes("aerospace") && (await c.run(brew, ["uninstall", "--cask", "aerospace"])).code !== 0) return ok(id, "failed", "Could not remove the AeroSpace Homebrew cask before installing the source build.");
  const placed = await installAppBundle(c, join(release, "AeroSpace.app"), aerospaceApp);
  if (placed) return ok(id, "failed", placed);
  await placeFile(join(release, "aerospace"), join(c.home, ".local/bin/aerospace"), 0o755);
  for (const page of (await readdir(join(source, ".man")).catch(() => [] as string[])).filter(name => name.endsWith(".1"))) await placeFile(join(source, ".man", page), join(c.home, ".local/share/man/man1", page), 0o644);
  await placeFile(join(source, ".shell-completion/zsh/_aerospace"), join(c.home, ".local/share/zsh/site-functions/_aerospace"), 0o644).catch(() => undefined);
  await c.run("/usr/bin/open", ["-a", aerospaceApp], { quiet: true });
  return ok(id);
}
