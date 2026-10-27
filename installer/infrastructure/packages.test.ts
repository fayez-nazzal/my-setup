import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commands } from "./commands";
import { inspectPackage, installRecipe } from "./packages";
import type { HostFacts } from "./host";
import type { PackageContext } from "./packages";
import type { DownloadPins } from "../domain/download-pins";
function context(executables: Map<string,string>, response: (command:string,args:readonly string[]) => {code:number;stdout:string;stderr:string}): PackageContext {
  const host: HostFacts = { platform:"linux", architecture:"x64", home:"/tmp/test-home", repositoryRoot:"/tmp/repo", executables, packageManagers:{} , gnome:{active:false}, graphical:true, macOS:{} };
  return { host, home:host.home, repoRoot:host.repositoryRoot, ensureLink:async () => "unchanged", run:async (command,args) => response(command,args) };
}
describe("software discovery", () => {
  test("recognizes Debian executable aliases without installing duplicate packages", async () => {
    const ctx = context(new Map([["fdfind","/usr/bin/fdfind"],["batcat","/usr/bin/batcat"]]), (command,args) => ({ code: command === "/usr/bin/fdfind" || command === "/usr/bin/batcat" ? 0 : 1, stdout:"version 1", stderr:"" }));
    expect((await inspectPackage(ctx,"fd")).installed).toBe(true);
    expect((await inspectPackage(ctx,"bat")).installed).toBe(true);
  });
  test("accepts only exact Geist Mono Nerd Font Mono faces", async () => {
    const lines = ["/etc/hosts"].flatMap(file => [`GeistMono Nerd Font Mono\tRegular\t${file}`, `GeistMono Nerd Font Mono\tBold\t${file}`, `GeistMono Nerd Font Mono\tItalic\t${file}`]).join("\n");
    const tools = () => new Map([["fc-list","/usr/bin/fc-list"],["fc-match","/usr/bin/fc-match"],["fc-cache","/usr/bin/fc-cache"]]);
    const answer = (output: string) => (command: string, args: readonly string[]) => {
      if (command === "/usr/bin/fc-list") return { code:0, stdout:output, stderr:"" };
      const style = String(args.at(-1)).split("style=")[1];
      return { code:0, stdout:output.split("\n").find(line => line.split("\t")[1] === style) ?? "", stderr:"" };
    };
    const exact = context(tools(), answer(lines));
    expect((await inspectPackage(exact,"nerd-font")).installed).toBe(true);
    const substituted = context(tools(), answer(lines.replaceAll("GeistMono Nerd Font Mono", "Geist Mono")));
    expect((await inspectPackage(substituted,"nerd-font")).installed).toBe(false);
  });
});

type Call = { command: string; args: readonly string[]; env?: Record<string, string> };
function recorded(executables: Map<string, string>, respond: (command: string, args: readonly string[]) => { code: number; stdout: string; stderr: string }) {
  const calls: Call[] = [];
  const host: HostFacts = { platform: "linux", architecture: "x64", home: "/tmp/test-home", repositoryRoot: "/tmp/repo", executables, packageManagers: {}, gnome: { active: false }, graphical: true, macOS: {} };
  const ctx: PackageContext = { host, home: host.home, repoRoot: host.repositoryRoot, ensureLink: async () => "unchanged", run: async (command, args, options) => { calls.push({ command, args, env: options?.env }); return respond(command, args); } };
  return { ctx, calls };
}

/** A tar.gz of `files` built with the real tar; returns its path and the SHA-256 the pin must carry. */
async function fixtureArchive(directory: string, files: Record<string, string>): Promise<{ archive: string; digest: string }> {
  const source = join(directory, "pkg");
  await mkdir(source);
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(source, name), body);
    await chmod(join(source, name), 0o755);
  }
  const archive = join(directory, "fixture.tar.gz");
  const made = await commands.run(Bun.which("tar")!, ["-czf", archive, "-C", source, ...Object.keys(files)], { quiet: true });
  if (made.code !== 0) throw new Error(made.stderr);
  return { archive, digest: createHash("sha256").update(await readFile(archive)).digest("hex") };
}

/** Real tar and real probes; the fixture curl copies the local archive to the path it is asked to write. */
function fixtureContext(home: string, archive: string, calls: Call[]): PackageContext {
  const curl = "/fixture/curl";
  const host: HostFacts = { platform: "linux", architecture: "x64", home, repositoryRoot: "/tmp/repo", executables: new Map([["curl", curl], ["tar", Bun.which("tar")!]]), packageManagers: {}, gnome: { active: false }, graphical: true, macOS: {} };
  return { host, home, repoRoot: host.repositoryRoot, ensureLink: async () => "unchanged", run: async (command, args, options) => {
    calls.push({ command, args, env: options?.env });
    if (command !== curl) return commands.run(command, args, options);
    await copyFile(archive, args[args.indexOf("-o") + 1]!);
    return { code: 0, stdout: "", stderr: "" };
  } };
}

describe("Volta and Node LTS", () => {
  const ok = { code: 0, stdout: "", stderr: "" };
  test("healthy Volta is never reinstalled", async () => {
    const { ctx, calls } = recorded(new Map([["volta", "/h/.volta/bin/volta"]]), () => ({ ...ok, stdout: "2.0.2" }));
    expect((await inspectPackage(ctx, "volta")).installed).toBe(true);
    const result = await installRecipe(ctx, "volta");
    expect(result.code).toBe(0);
    expect(calls.some(call => call.command === "/usr/bin/curl")).toBe(false);
  });
  test("missing Volta installs the pinned archive into VOLTA_HOME/bin and never runs setup", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "volta-install-"));
    const home = join(sandbox, "home"), voltaHome = join(home, ".volta");
    const saved = process.env.VOLTA_HOME;
    process.env.VOLTA_HOME = voltaHome;
    try {
      await mkdir(home);
      const probe = `#!/bin/sh\n[ "$VOLTA_HOME" = "${voltaHome}" ] && echo 2.0.2\n`;
      const { archive, digest } = await fixtureArchive(sandbox, { volta: probe, "volta-shim": "#!/bin/sh\nexit 0\n", "volta-migrate": "#!/bin/sh\nexit 0\n" });
      const pins: DownloadPins = { volta: { "linux-x64": { version: "2.0.2", url: "https://fixture.invalid/volta-2.0.2-linux.tar.gz", digest, members: ["volta", "volta-shim", "volta-migrate"] } } };
      const calls: Call[] = [];
      expect(await installRecipe(fixtureContext(home, archive, calls), "volta", pins)).toMatchObject({ code: 0 });
      expect((await readdir(join(voltaHome, "bin"))).sort()).toEqual(["volta", "volta-migrate", "volta-shim"]);
      expect(await readdir(home)).toEqual([".volta"]);
      expect(calls.some(call => call.args.includes("setup"))).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.VOLTA_HOME; else process.env.VOLTA_HOME = saved;
      await rm(sandbox, { recursive: true, force: true });
    }
  });
  test("Volta needs curl and tar for its pinned archive, not bash", async () => {
    const withoutTar = recorded(new Map([["curl", "/usr/bin/curl"], ["bash", "/bin/bash"]]), () => ok);
    expect(await inspectPackage(withoutTar.ctx, "volta")).toMatchObject({ installed: false, healthy: false, reason: "curl and tar are required to install the pinned Volta archive." });
    expect((await installRecipe(withoutTar.ctx, "volta")).code).toBe(1);
    expect(withoutTar.calls.length).toBe(0);
    const withoutBash = recorded(new Map([["curl", "/usr/bin/curl"], ["tar", "/usr/bin/tar"]]), () => ok);
    expect((await inspectPackage(withoutBash.ctx, "volta")).route).toBe("github-release");
  });
  test("Node LTS is installed through Volta with an explicit VOLTA_HOME", async () => {
    const { ctx, calls } = recorded(new Map([["volta", "/h/.volta/bin/volta"]]), (_c, args) => args[0] === "list" ? ok : ok);
    expect(await inspectPackage(ctx, "node-lts")).toMatchObject({ installed: false, route: "volta-node" });
    expect((await installRecipe(ctx, "node-lts")).code).toBe(0);
    const install = calls.find(call => call.args[0] === "install")!;
    expect(install.command).toBe("/h/.volta/bin/volta");
    expect(install.args).toEqual(["install", "node"]);
    expect(install.env?.VOLTA_HOME).toBeTruthy();
  });
  test("an existing Volta default Node runtime makes Node LTS a no-op", async () => {
    const { ctx, calls } = recorded(new Map([["volta", "/h/.volta/bin/volta"]]), (_c, args) => args[0] === "list" ? { ...ok, stdout: "runtime node@22.11.0 (default)\n" } : ok);
    expect((await inspectPackage(ctx, "node-lts")).installed).toBe(true);
    expect((await installRecipe(ctx, "node-lts")).code).toBe(0);
    expect(calls.some(call => call.args[0] === "install")).toBe(false);
  });
  test("Node LTS refuses to run without Volta and surfaces Volta failures", async () => {
    const none = recorded(new Map(), () => ok);
    expect((await installRecipe(none.ctx, "node-lts")).code).toBe(1);
    expect(none.calls.length).toBe(0);
    const failing = recorded(new Map([["volta", "/h/.volta/bin/volta"]]), (_c, args) => args[0] === "install" ? { code: 1, stdout: "", stderr: "network down" } : ok);
    const result = await installRecipe(failing.ctx, "node-lts");
    expect(result).toMatchObject({ code: 1, stderr: "network down" });
  });
});
