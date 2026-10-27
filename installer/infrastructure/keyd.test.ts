import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installKeyd, installKeydFromSource } from "./desktop";
import type { HostFacts } from "./host";
import type { RecipeContext } from "./tools";

const keydPinnedCommit = "7c0aecb8bfd34dc8642bf4eefd2e59c89e61cec3";
const sourceDefault = "caps = f13\n";
const sourceApple = "leftcommand = layer(command)\n";
const appleDevices = "I: Bus=0003 Vendor=004c Product=029c Version=0001\nN: Name=\"Magic Keyboard\"\n";
const otherDevices = "I: Bus=0003 Vendor=046d Product=c52b Version=0001\nN: Name=\"Keyboard\"\n";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const exists = (path: string) => lstat(path).then(() => true, () => false);
const outcome = (code: number, stdout = "") => ({ code, stdout, stderr: "" });

type System = { calls: string[]; active: boolean; enabled: boolean; reloads: number[]; gitHead: string; failStage: boolean };
const newSystem = (): System => ({ calls: [], active: true, enabled: true, reloads: [], gitHead: "", failStage: false });
const mutations = (system: System) => system.calls.filter((call) => /^(mv|rm|mkdir|install|cp|keyd) /.test(call));

// Emulates the privileged commands the recipes issue, against the real temp filesystem.
async function install(system: System, args: string[]) {
  let mode = 0o755;
  let directory = false;
  const paths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-d") directory = true;
    else if (args[i] === "-m") mode = parseInt(args[++i], 8);
    else if (args[i] === "-o" || args[i] === "-g") i++;
    else paths.push(args[i]);
  }
  if (directory) {
    await mkdir(paths[0], { recursive: true });
    await chmod(paths[0], mode);
    return outcome(0);
  }
  const [source, destination] = paths;
  if (system.failStage && destination.includes(".my-setup-stage-")) return outcome(1);
  if ((await lstat(destination).catch(() => undefined))?.isSymbolicLink()) return outcome(1);
  await copyFile(source, destination);
  await chmod(destination, mode);
  return outcome(0);
}

async function execute(system: System, command: string, args: string[]) {
  system.calls.push([command, ...args].join(" "));
  try {
    switch (command) {
      case "install": return await install(system, args);
      case "mv": await rename(args[1], args[2]); return outcome(0);
      case "rm": {
        const force = args.some((arg) => arg.startsWith("-") && arg.includes("f"));
        const recursive = args.some((arg) => arg.startsWith("-") && /[rR]/.test(arg));
        for (const path of args.filter((arg) => !arg.startsWith("-"))) await rm(path, { recursive, force });
        return outcome(0);
      }
      case "mkdir": {
        const path = args[args.length - 1];
        await mkdir(path);
        await chmod(path, parseInt(args[args.indexOf("-m") + 1], 8));
        return outcome(0);
      }
      case "cp": {
        if ((await lstat(args[1])).isSymbolicLink()) await symlink(await readlink(args[1]), args[2]);
        else await copyFile(args[1], args[2]);
        return outcome(0);
      }
      case "systemctl":
        switch (args[0]) {
          case "is-active": return outcome(system.active ? 0 : 3);
          case "is-enabled": return outcome(system.enabled ? 0 : 1);
          case "enable": system.enabled = true; return outcome(0);
          case "start": system.active = true; return outcome(0);
        }
        return outcome(127);
      case "keyd":
        if (args[0] === "reload") return outcome(system.reloads.shift() ?? 0);
        return outcome(args[0] === "--version" ? 0 : 127);
      case "git":
        if (args[0] === "clone") { await mkdir(args[args.length - 1]); return outcome(0); }
        if (args[0] === "rev-parse") return outcome(0, `${system.gitHead}\n`);
        return outcome(127);
      case "dpkg-query": return outcome(0, "install ok installed");
      case "make": return outcome(0);
    }
    return outcome(127);
  } catch {
    return outcome(1);
  }
}

const fakeRun = (system: System): RecipeContext["run"] => async (command, args) => command === "sudo" ? execute(system, args[0], args.slice(1)) : execute(system, command, args);
const linuxHost = (executables: Array<[string, string]>, apt?: string) => ({ platform: "linux", executables: new Map(executables), packageManagers: apt ? { apt } : {} }) as HostFacts;

describe("keyd publication", () => {
  let root: string;
  let repo: string;
  let etc: string;
  let devices: string;
  let system: System;
  let host: HostFacts;

  const context = () => ({ host, home: root, repoRoot: repo, run: fakeRun(system) }) as RecipeContext;
  const paths = (inputDevices = devices) => ({ directory: etc, inputDevices, owner: process.getuid?.() ?? 0 });
  const makeEtc = async (mode = 0o755) => {
    await mkdir(etc, { recursive: true });
    await chmod(etc, mode);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "my-setup-keyd-"));
    repo = join(root, "repo");
    etc = join(root, "etc", "keyd");
    devices = join(root, "devices");
    await mkdir(join(repo, "keyd"), { recursive: true });
    await writeFile(join(repo, "keyd", "default.conf"), sourceDefault);
    await writeFile(join(repo, "keyd", "apple-magic-keyboard.conf"), sourceApple);
    await writeFile(devices, otherDevices);
    system = newSystem();
    host = linuxHost([["keyd", "keyd"], ["systemctl", "systemctl"]]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("publishes fresh copies, records their digests, and reloads the active daemon", async () => {
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect((await lstat(join(etc, "default.conf"))).isFile()).toBe(true);
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe(sourceDefault);
    expect(await readFile(join(etc, ".my-setup-sha256"), "utf8")).toBe(`${digest(sourceDefault)}  default.conf\n`);
    expect(await exists(join(etc, "apple-magic-keyboard.conf"))).toBe(false);
    expect(system.calls.filter((call) => call === "keyd reload")).toHaveLength(1);
    expect(result.attention).toEqual([]);
  });

  test.skipIf(process.getuid?.() !== 0)("publishes root-owned copies", async () => {
    await installKeyd(context(), paths());
    expect((await stat(etc)).uid).toBe(0);
    expect((await stat(join(etc, "default.conf"))).uid).toBe(0);
  });

  test("replaces a legacy symlink into the checkout after backing it up", async () => {
    await makeEtc();
    await symlink(join(repo, "keyd", "default.conf"), join(etc, "default.conf"));
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect((await lstat(join(etc, "default.conf"))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe(sourceDefault);
    const [backupName] = await readdir(join(etc, ".my-setup-backups"));
    const backup = join(etc, ".my-setup-backups", backupName);
    expect((await lstat(join(backup, "default.conf"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(backup, "default.conf.snapshot"), "utf8")).toBe(sourceDefault);
    expect(await readFile(join(repo, "keyd", "default.conf"), "utf8")).toBe(sourceDefault);
    expect(result.attention.join("\n")).toContain(backup);
  });

  test("reapplying unchanged copies touches no files and does not reload", async () => {
    await installKeyd(context(), paths());
    const before = await stat(join(etc, "default.conf"));
    system.calls.splice(0);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("unchanged");
    expect(mutations(system)).toEqual([]);
    expect((await stat(join(etc, "default.conf"))).ino).toBe(before.ino);
  });

  test("updates a managed copy only when the checkout is republished", async () => {
    await installKeyd(context(), paths());
    await writeFile(join(repo, "keyd", "default.conf"), "caps = esc\n");
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe(sourceDefault);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe("caps = esc\n");
    expect(system.calls.filter((call) => call === "keyd reload")).toHaveLength(2);
  });

  test("blocks on an edited managed copy and changes nothing", async () => {
    await installKeyd(context(), paths());
    await writeFile(join(etc, "default.conf"), "edited\n");
    system.calls.splice(0);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe("edited\n");
    expect(mutations(system)).toEqual([]);
  });

  test("preserves an unrecorded file and blocks the whole plan without writing anything", async () => {
    await makeEtc();
    await writeFile(join(etc, "default.conf"), "unmanaged\n");
    await writeFile(devices, appleDevices);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe("unmanaged\n");
    expect(await exists(join(etc, "apple-magic-keyboard.conf"))).toBe(false);
    expect(mutations(system)).toEqual([]);
  });

  test("preserves a foreign symlink and blocks", async () => {
    await makeEtc();
    await writeFile(join(root, "other.conf"), "other\n");
    await symlink(join(root, "other.conf"), join(etc, "default.conf"));
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(await readlink(join(etc, "default.conf"))).toBe(join(root, "other.conf"));
    expect(mutations(system)).toEqual([]);
  });

  test("blocks when the keyd directory is a symlink", async () => {
    await mkdir(join(root, "elsewhere"));
    await mkdir(join(root, "etc"));
    await symlink(join(root, "elsewhere"), etc);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(mutations(system)).toEqual([]);
  });

  test("blocks when the keyd directory is group-writable", async () => {
    await makeEtc(0o775);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(mutations(system)).toEqual([]);
  });

  test("blocks when the record file is a symlink", async () => {
    await makeEtc();
    await symlink(join(root, "elsewhere"), join(etc, ".my-setup-sha256"));
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(mutations(system)).toEqual([]);
  });

  test("blocks when the record file is malformed", async () => {
    await makeEtc();
    await writeFile(join(etc, ".my-setup-sha256"), "not-a-digest  default.conf\n");
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(mutations(system)).toEqual([]);
  });

  test("blocks when the record file is group-writable", async () => {
    await makeEtc();
    await writeFile(join(etc, ".my-setup-sha256"), `${digest(sourceDefault)}  default.conf\n`);
    await chmod(join(etc, ".my-setup-sha256"), 0o664);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("blocked");
    expect(mutations(system)).toEqual([]);
  });

  test("adopts an identical unrecorded copy without rewriting it", async () => {
    await makeEtc();
    await writeFile(join(etc, "default.conf"), sourceDefault);
    await chmod(join(etc, "default.conf"), 0o644);
    const before = await stat(join(etc, "default.conf"));
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect((await stat(join(etc, "default.conf"))).ino).toBe(before.ino);
    expect(system.calls.some((call) => call.startsWith("mv ") && call.endsWith(join(etc, "default.conf")))).toBe(false);
    expect(system.calls.filter((call) => call === "keyd reload")).toHaveLength(0);
    expect(await readFile(join(etc, ".my-setup-sha256"), "utf8")).toBe(`${digest(sourceDefault)}  default.conf\n`);
  });

  test("repairs an identical copy with unsafe permissions", async () => {
    await makeEtc();
    await writeFile(join(etc, "default.conf"), sourceDefault);
    await chmod(join(etc, "default.conf"), 0o666);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect((await stat(join(etc, "default.conf"))).mode & 0o777).toBe(0o644);
  });

  test("publishes the Apple copy only when a supported device is present", async () => {
    await writeFile(devices, appleDevices);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect(await readFile(join(etc, "apple-magic-keyboard.conf"), "utf8")).toBe(sourceApple);
    expect(await readFile(join(etc, ".my-setup-sha256"), "utf8")).toBe(
      `${digest(sourceApple)}  apple-magic-keyboard.conf\n${digest(sourceDefault)}  default.conf\n`,
    );
  });

  test("removes an unmodified published Apple copy after backup when no Apple device is present", async () => {
    await writeFile(devices, appleDevices);
    await installKeyd(context(), paths());
    await writeFile(devices, otherDevices);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect(await exists(join(etc, "apple-magic-keyboard.conf"))).toBe(false);
    const [backupName] = await readdir(join(etc, ".my-setup-backups"));
    expect(await readFile(join(etc, ".my-setup-backups", backupName, "apple-magic-keyboard.conf"), "utf8")).toBe(sourceApple);
    expect(await readFile(join(etc, ".my-setup-sha256"), "utf8")).toBe(`${digest(sourceDefault)}  default.conf\n`);
  });

  test("keeps an edited published Apple copy with attention when no Apple device is present", async () => {
    await writeFile(devices, appleDevices);
    await installKeyd(context(), paths());
    await writeFile(devices, otherDevices);
    await writeFile(join(etc, "apple-magic-keyboard.conf"), "edited\n");
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("unchanged");
    expect(await readFile(join(etc, "apple-magic-keyboard.conf"), "utf8")).toBe("edited\n");
    expect(result.attention.join("\n")).toContain("was edited");
  });

  test("removes a legacy Apple link after backup when no Apple device is present", async () => {
    await makeEtc();
    await symlink(join(repo, "keyd", "apple-magic-keyboard.conf"), join(etc, "apple-magic-keyboard.conf"));
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("changed");
    expect(await exists(join(etc, "apple-magic-keyboard.conf"))).toBe(false);
    const [backupName] = await readdir(join(etc, ".my-setup-backups"));
    expect(await readFile(join(etc, ".my-setup-backups", backupName, "apple-magic-keyboard.conf.snapshot"), "utf8")).toBe(sourceApple);
    expect(await readFile(join(repo, "keyd", "apple-magic-keyboard.conf"), "utf8")).toBe(sourceApple);
  });

  test("preserves published Apple copies when devices cannot be read", async () => {
    await writeFile(devices, appleDevices);
    await installKeyd(context(), paths());
    const result = await installKeyd(context(), paths(join(root, "missing-devices")));
    expect(result.status).toBe("unchanged");
    expect(await readFile(join(etc, "apple-magic-keyboard.conf"), "utf8")).toBe(sourceApple);
    expect(result.attention.join("\n")).toContain("Could not read");
  });

  test("does not create an absent Apple copy when devices cannot be read", async () => {
    const result = await installKeyd(context(), paths(join(root, "missing-devices")));
    expect(result.status).toBe("changed");
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe(sourceDefault);
    expect(await exists(join(etc, "apple-magic-keyboard.conf"))).toBe(false);
  });

  test("converts a legacy Apple link to a copy when devices cannot be read", async () => {
    await makeEtc();
    await symlink(join(repo, "keyd", "apple-magic-keyboard.conf"), join(etc, "apple-magic-keyboard.conf"));
    await installKeyd(context(), paths(join(root, "missing-devices")));
    expect((await lstat(join(etc, "apple-magic-keyboard.conf"))).isFile()).toBe(true);
    expect(await readFile(join(etc, "apple-magic-keyboard.conf"), "utf8")).toBe(sourceApple);
  });

  test("restores the legacy link as a regular file when reload fails and reports failure", async () => {
    await makeEtc();
    await symlink(join(repo, "keyd", "default.conf"), join(etc, "default.conf"));
    system.reloads.push(1, 0);
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("failed");
    expect((await lstat(join(etc, "default.conf"))).isFile()).toBe(true);
    expect(await readFile(join(etc, "default.conf"), "utf8")).toBe(sourceDefault);
    expect(await exists(join(etc, ".my-setup-sha256"))).toBe(false);
    expect(system.calls.filter((call) => call === "keyd reload")).toHaveLength(2);
    expect(result.attention.join("\n")).toContain("restored and reloaded");
  });

  test("leaves the legacy link untouched and does not reload when staging fails", async () => {
    await makeEtc();
    await symlink(join(repo, "keyd", "default.conf"), join(etc, "default.conf"));
    system.failStage = true;
    const result = await installKeyd(context(), paths());
    expect(result.status).toBe("failed");
    expect((await lstat(join(etc, "default.conf"))).isSymbolicLink()).toBe(true);
    expect(system.calls.filter((call) => call === "keyd reload")).toHaveLength(0);
    expect((await readdir(etc)).filter((name) => name.startsWith(".my-setup-stage-"))).toHaveLength(0);
  });

  test.skipIf(process.getuid?.() !== 0)("keeps root-owned record and copies after publish", async () => {
    await installKeyd(context(), paths());
    expect((await stat(join(etc, ".my-setup-sha256"))).uid).toBe(0);
  });
});

describe("keyd source route", () => {
  let system: System;

  beforeEach(() => {
    system = newSystem();
  });

  const sourceHost = linuxHost([["git", "git"], ["make", "make"], ["dpkg-query", "dpkg-query"], ["apt-cache", "apt-cache"]], "apt-get");
  const context = () => ({ host: sourceHost, home: "/unused", repoRoot: "/unused", run: fakeRun(system) }) as RecipeContext;

  test("refuses a clone that does not resolve to the pinned commit before building", async () => {
    system.gitHead = "0123456789abcdef0123456789abcdef01234567";
    const result = await installKeydFromSource(context());
    expect(result.status).toBe("failed");
    expect(system.calls.some((call) => call.startsWith("git clone") && call.includes("--branch v2.6.0"))).toBe(true);
    expect(system.calls.some((call) => call.startsWith("make"))).toBe(false);
  });

  test("builds and installs when the clone resolves to the pinned commit", async () => {
    system.gitHead = keydPinnedCommit;
    const result = await installKeydFromSource(context());
    expect(result.status).toBe("changed");
    expect(system.calls).toContain("make");
    expect(system.calls).toContain("make install");
    expect(system.calls).toContain("keyd --version");
  });
});
