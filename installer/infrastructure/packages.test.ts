import { describe, expect, test } from "bun:test";
import { inspectPackage, installRecipe } from "./packages";
import type { HostFacts } from "./host";
import type { PackageContext } from "./packages";
function context(executables: Map<string,string>, response: (command:string,args:readonly string[]) => {code:number;stdout:string;stderr:string}): PackageContext {
  const host: HostFacts = { platform:"linux", architecture:"x64", home:"/tmp/test-home", repositoryRoot:"/tmp/repo", executables, packageManagers:{} , gnome:{active:false}, macOS:{} };
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
  const host: HostFacts = { platform: "linux", architecture: "x64", home: "/tmp/test-home", repositoryRoot: "/tmp/repo", executables, packageManagers: {}, gnome: { active: false }, macOS: {} };
  const ctx: PackageContext = { host, home: host.home, repoRoot: host.repositoryRoot, ensureLink: async () => "unchanged", run: async (command, args, options) => { calls.push({ command, args, env: options?.env }); return respond(command, args); } };
  return { ctx, calls };
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
  test("missing Volta uses the official installer without editing shell startup files", async () => {
    const { ctx, calls } = recorded(new Map([["curl", "/usr/bin/curl"], ["bash", "/bin/bash"]]), () => ok);
    const state = await inspectPackage(ctx, "volta");
    expect(state).toMatchObject({ installed: false, route: "volta-installer" });
    expect((await installRecipe(ctx, "volta")).code).toBe(0);
    const fetch = calls.find(call => call.command === "/usr/bin/curl")!;
    expect(fetch.args).toContain("https://get.volta.sh");
    const run = calls.find(call => call.command === "/bin/bash")!;
    expect(run.args.at(-1)).toBe("--skip-setup");
  });
  test("Volta is unavailable without curl and bash", async () => {
    const { ctx } = recorded(new Map(), () => ({ code: 1, stdout: "", stderr: "" }));
    const state = await inspectPackage(ctx, "volta");
    expect(state.route).toBeUndefined();
    expect((await installRecipe(ctx, "volta")).code).toBe(1);
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
