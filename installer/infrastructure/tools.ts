import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecipeContext } from "./packages";
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
  return result.code === 0 ? ok(id) : ok(id, "failed", `${command} ${args.join(" ")} failed (exit ${result.code}).`);
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
  const executablePath = executable(c, "tmuxscope");
  if (executablePath) return ok("tmuxscope", "unchanged");
  const dir = join(c.home, "repos/tools/tmuxscope");
  const dist = join(dir, "dist/tmuxscope");
  const userBin = join(c.home, ".local/bin/tmuxscope");
  if (await exists(dir)) {
    const stat = await lstat(dir);
    if (!stat.isDirectory()) return ok("tmuxscope", "blocked", `${dir} exists and is not a directory; move it aside manually.`);
  } else {
    if (!executable(c, "git")) return ok("tmuxscope", "blocked", "tmuxscope needs git to clone its source checkout.");
    await mkdir(join(c.home, "repos/tools"), { recursive: true });
    const cloned = await run(c, "tmuxscope", executable(c, "git") ?? "git", ["clone", "--quiet", "--single-branch", "--branch", "main", "https://github.com/fayez-nazzal/tmuxscope.git", dir]);
    if (cloned.status !== "changed") return cloned;
  }
  let distHealthy = await executableFile(dist);
  if (distHealthy) distHealthy = (await c.run(dist, ["--version"])).code === 0;
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
      const r = await c.run(brew, ["install", pkg], { env: { HOMEBREW_NO_AUTO_UPDATE: "1" } });
      if (r.code !== 0) return ok("alacritty", "failed", `Could not install missing ${pkg} build prerequisite.`);
    }
  }
  const developerDir = await c.run(executable(c, "xcode-select") ?? "xcode-select", ["-p"]);
  if (developerDir.code !== 0) return ok("alacritty", "blocked", "Install Xcode command-line tools with xcode-select --install, then rerun.");
  if (!executable(c, "git") || !executable(c, "curl")) return ok("alacritty", "blocked", "The Alacritty source route requires git and curl.");
  const release = await c.run(executable(c, "curl") ?? "curl", ["-fsSL", "https://api.github.com/repos/alacritty/alacritty/releases/latest"]);
  if (release.code !== 0 || !release.stdout) return ok("alacritty", "failed", "Could not look up a stable Alacritty release.");
  let tag = "";
  try { const data = JSON.parse(release.stdout); if (!data.prerelease && typeof data.tag_name === "string") tag = data.tag_name; } catch { /* Invalid upstream metadata. */ }
  if (!tag) return ok("alacritty", "failed", "Alacritty release metadata did not contain a stable tag.");
  const destination = join(c.home, "Applications/Alacritty.app");
  const temp = join(c.home, `.my-setup-alacritty-${process.pid}`);
  try {
    const clone = await run(c, "alacritty", executable(c, "git") ?? "git", ["clone", "--quiet", "--depth", "1", "--branch", tag, "https://github.com/alacritty/alacritty.git", temp]);
    if (clone.status !== "changed") return clone;
    const manifest = await readFile(join(temp, "Cargo.toml"), "utf8").catch(() => "");
    const msrv = /^rust-version\s*=\s*"(\d+)\.(\d+)\.(\d+)"/m.exec(manifest);
    const compiler = await c.run(executable(c, "rustc")!, ["--version"]);
    const installedRust = /rustc\s+(\d+)\.(\d+)\.(\d+)/.exec(compiler.stdout ?? "");
    if (compiler.code !== 0 || !installedRust) return ok("alacritty", "failed", "Could not verify the installed Rust compiler version.");
    const requiredVersion = msrv ? msrv.slice(1).map(Number) : [1, 85, 0];
    const currentVersion = installedRust.slice(1).map(Number);
    for (let index = 0; index < 3; index++) {
      if (currentVersion[index]! === requiredVersion[index]!) continue;
      if (currentVersion[index]! < requiredVersion[index]!) return ok("alacritty", "blocked", `Alacritty ${tag} requires Rust ${requiredVersion.join(".")}; installed rustc is ${currentVersion.join(".")}. Install a compatible toolchain without silently replacing Rust.`);
      break;
    }
    const build = await run(c, "alacritty", executable(c, "make") ?? "make", ["app"], { cwd: temp });
    if (build.status !== "changed") return build;
    const app = join(temp, "target/release/osx/Alacritty.app");
    const binary = join(app, "Contents/MacOS/alacritty");
    if (!await exists(binary)) return ok("alacritty", "failed", "Alacritty build output is missing its app executable.");
    const check = await c.run(binary, ["--version"]);
    if (check.code !== 0) return ok("alacritty", "failed", "Built Alacritty executable failed its version check.");
    const stage = `${destination}.stage-${process.pid}`;
    await mkdir(join(c.home, "Applications"), { recursive: true });
    await rm(stage, { recursive: true, force: true });
    const cp = await c.run("ditto", [app, stage]);
    if (cp.code !== 0) { await rm(stage, { recursive: true, force: true }); return ok("alacritty", "failed", "Could not stage the built Alacritty app in ~/Applications."); }
    let backup: string | undefined;
    if (await exists(destination)) {
      if (!c.backupUserFile) { await rm(stage, { recursive: true, force: true }); return ok("alacritty", "blocked", `${destination} must be preserved before replacement; backup support is unavailable.`); }
      backup = await c.backupUserFile(destination);
    }
    try { await rename(stage, destination); }
    catch (error) {
      await rm(stage, { recursive: true, force: true });
      if (backup) await rename(backup, destination).catch(() => undefined);
      return ok("alacritty", "failed", `Could not place Alacritty.app: ${error instanceof Error ? error.message : String(error)}`);
    }
    const infocmp = executable(c, "infocmp");
    if (!infocmp || (await c.run(infocmp, ["alacritty"])).code !== 0) {
      const tic = await c.run(executable(c, "tic") ?? "tic", ["-xe", "alacritty,alacritty-direct", "-o", join(c.home, ".terminfo"), join(temp, "extra/alacritty.info")], { cwd: temp });
      if (tic.code !== 0) return ok("alacritty", "failed", "App installed, but Alacritty terminfo could not be installed.");
    }
    return ok("alacritty");
  } finally { await rm(temp, { recursive: true, force: true }); }
}
