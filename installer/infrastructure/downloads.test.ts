import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ArchivePin, DownloadPins } from "../domain/download-pins";
import { commands } from "./commands";
import { UserFileLinks } from "./links";
import { installRecipe } from "./packages";
import type { HostFacts } from "./host";
import type { PackageContext } from "./packages";

const tar = Bun.which("tar")!;
const url = "https://fixture.invalid/pinned.tar.gz";

/** A tar.gz of `files` built with the real tar; the pin must carry the returned SHA-256. */
async function fixtureArchive(directory: string, files: Record<string, string>): Promise<{ archive: string; digest: string }> {
  const source = join(directory, "pkg");
  for (const [name, body] of Object.entries(files)) {
    await mkdir(dirname(join(source, name)), { recursive: true });
    await writeFile(join(source, name), body);
    await chmod(join(source, name), 0o755);
  }
  const archive = join(directory, "fixture.tar.gz");
  const made = await commands.run(tar, ["-czf", archive, "-C", source, ...Object.keys(files)], { quiet: true });
  if (made.code !== 0) throw new Error(made.stderr);
  return { archive, digest: createHash("sha256").update(await readFile(archive)).digest("hex") };
}

/** The same archive with one byte flipped, so its digest no longer matches the pin. */
async function corrupted(archive: string): Promise<string> {
  const bytes = new Uint8Array(await readFile(archive));
  bytes[bytes.length >> 1] ^= 0xff;
  const path = `${archive}.corrupt`;
  await writeFile(path, bytes);
  return path;
}

type Call = { command: string; args: readonly string[] };

/** Real tar, probes, and backups in `home`; fixture curl copies `served` to the path it is asked to write, or fails with 404 when nothing is served. */
function contextFor(home: string, served: string | undefined, calls: Call[], backupUserFile?: (destination: string) => Promise<string>): PackageContext {
  const curl = "/fixture/curl";
  const links = new UserFileLinks({ home });
  const host: HostFacts = { platform: "linux", architecture: "x64", home, repositoryRoot: "/tmp/repo", executables: new Map([["curl", curl], ["tar", tar]]), packageManagers: {}, gnome: { active: false }, graphical: true, macOS: {} };
  return {
    host, home, repoRoot: host.repositoryRoot, ensureLink: async () => "unchanged",
    backupUserFile: backupUserFile ?? (destination => links.backup(destination)),
    run: async (command, args, options) => {
      calls.push({ command, args });
      if (command !== curl) return commands.run(command, args, options);
      if (!served) return { code: 22, stdout: "", stderr: "404 Not Found" };
      await copyFile(served, args[args.indexOf("-o") + 1]!);
      return { code: 0, stdout: "", stderr: "" };
    },
  };
}

const pinOf = ({ digest }: { digest: string }, members: string[]): ArchivePin => ({ version: "1.0.0", url, digest, members });
const pinsFor = (id: string, pin: ArchivePin): DownloadPins => ({ [id]: { "linux-x64": pin } });

const savedVoltaHome = process.env.VOLTA_HOME;
const dirs: string[] = [];
afterEach(async () => {
  if (savedVoltaHome === undefined) delete process.env.VOLTA_HOME; else process.env.VOLTA_HOME = savedVoltaHome;
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function sandbox(): Promise<{ root: string; home: string; bin: string }> {
  const root = await mkdtemp(join(tmpdir(), "pinned-downloads-"));
  dirs.push(root);
  const home = join(root, "home");
  const bin = join(home, ".local/bin");
  await mkdir(bin, { recursive: true });
  return { root, home, bin };
}

describe("pinned downloads", () => {
  test("a pinned archive publishes its nested member as ~/.local/bin/<id> after the version probe", async () => {
    const { root, home, bin } = await sandbox();
    const script = "#!/bin/sh\necho bat 0.26.1\n";
    const { archive, digest } = await fixtureArchive(root, { "bat-v0.26.1-x86_64-unknown-linux-gnu/bat": script });
    const calls: Call[] = [];
    const result = await installRecipe(contextFor(home, archive, calls), "bat", pinsFor("bat", pinOf({ digest }, ["bat-v0.26.1-x86_64-unknown-linux-gnu/bat"])));
    expect(result).toMatchObject({ code: 0 });
    expect(await readFile(join(bin, "bat"), "utf8")).toBe(script);
    expect((await stat(join(bin, "bat"))).mode & 0o111).not.toBe(0);
    expect(await readdir(bin)).toEqual(["bat"]);
  });

  test("a root-level archive entry listed as ./eza installs as ~/.local/bin/eza", async () => {
    const { root, home, bin } = await sandbox();
    const { archive, digest } = await fixtureArchive(root, { "./eza": "#!/bin/sh\necho eza 0.23.5\n" });
    const result = await installRecipe(contextFor(home, archive, []), "eza", pinsFor("eza", pinOf({ digest }, ["eza"])));
    expect(result).toMatchObject({ code: 0 });
    expect(await readdir(bin)).toEqual(["eza"]);
  });

  test("a corrupted archive is refused before any listing, extraction, probe, or publication", async () => {
    const { root, home, bin } = await sandbox();
    await writeFile(join(bin, "bat"), "previous");
    const { archive, digest } = await fixtureArchive(root, { "bat-v0.26.1-x86_64-unknown-linux-gnu/bat": "#!/bin/sh\necho bat\n" });
    const calls: Call[] = [];
    const result = await installRecipe(contextFor(home, await corrupted(archive), calls), "bat", pinsFor("bat", pinOf({ digest }, ["bat-v0.26.1-x86_64-unknown-linux-gnu/bat"])));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("failed its SHA-256 check");
    expect(calls.some(call => call.command === tar)).toBe(false);
    expect(calls.some(call => call.args.includes("--version"))).toBe(false);
    expect(await readFile(join(bin, "bat"), "utf8")).toBe("previous");
    expect(await readdir(bin)).toEqual(["bat"]);
  });

  test("a missing download installs nothing and reports the failed URL", async () => {
    const { root, home, bin } = await sandbox();
    const { digest } = await fixtureArchive(root, { "bat": "#!/bin/sh\necho bat\n" });
    const result = await installRecipe(contextFor(home, undefined, []), "bat", pinsFor("bat", pinOf({ digest }, ["bat"])));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Download failed: ${url}`);
    expect(await readdir(bin)).toEqual([]);
  });

  test("an archive without the pinned member is refused before extraction", async () => {
    const { root, home, bin } = await sandbox();
    const { archive, digest } = await fixtureArchive(root, { "bat": "#!/bin/sh\necho bat\n" });
    const calls: Call[] = [];
    const result = await installRecipe(contextFor(home, archive, calls), "bat", pinsFor("bat", pinOf({ digest }, ["bat-v0.26.1-x86_64-unknown-linux-gnu/bat"])));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("has no bat-v0.26.1-x86_64-unknown-linux-gnu/bat entry");
    expect(calls.some(call => call.args.includes("-xf"))).toBe(false);
    expect(await readdir(bin)).toEqual([]);
  });

  test("a platform without a pin refuses before any download", async () => {
    const { home } = await sandbox();
    const calls: Call[] = [];
    const result = await installRecipe(contextFor(home, undefined, calls), "bat", {});
    expect(result).toMatchObject({ code: 1, stderr: "No pinned bat release for linux-x64." });
    expect(calls.some(call => call.command === "/fixture/curl")).toBe(false);
  });

  test("a failed version probe restores the previous executable from the backup tree", async () => {
    const { root, home, bin } = await sandbox();
    await writeFile(join(bin, "bat"), "previous");
    const { archive, digest } = await fixtureArchive(root, { "bat": "#!/bin/sh\nexit 1\n" });
    const result = await installRecipe(contextFor(home, archive, []), "bat", pinsFor("bat", pinOf({ digest }, ["bat"])));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bat release failed its version probe");
    expect(await readFile(join(bin, "bat"), "utf8")).toBe("previous");
    expect(await readdir(bin)).toEqual(["bat"]);
  });

  test("Volta: a failed backup of the second binary restores the first and leaves the rest untouched", async () => {
    const { root, home } = await sandbox();
    const voltaHome = join(home, ".volta");
    const voltaBin = join(voltaHome, "bin");
    process.env.VOLTA_HOME = voltaHome;
    await mkdir(voltaBin, { recursive: true });
    await writeFile(join(voltaBin, "volta"), "old-volta");
    await writeFile(join(voltaBin, "volta-shim"), "old-shim");
    const members = ["volta", "volta-shim", "volta-migrate"];
    const { archive, digest } = await fixtureArchive(root, Object.fromEntries(members.map(name => [name, "#!/bin/sh\necho 2.0.2\n"])));
    const links = new UserFileLinks({ home });
    let backups = 0;
    const refuseSecond = async (destination: string) => { if (++backups === 2) throw new Error("backup refused"); return links.backup(destination); };
    const result = await installRecipe(contextFor(home, archive, [], refuseSecond), "volta", pinsFor("volta", pinOf({ digest }, members)));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("backup refused");
    expect(await readFile(join(voltaBin, "volta"), "utf8")).toBe("old-volta");
    expect(await readFile(join(voltaBin, "volta-shim"), "utf8")).toBe("old-shim");
    expect((await readdir(voltaBin)).sort()).toEqual(["volta", "volta-shim"]);
  });
});
