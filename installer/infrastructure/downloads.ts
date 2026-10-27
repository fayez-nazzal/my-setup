import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ArchivePin } from "../domain/download-pins";
import type { PackageContext } from "./packages";

/** One exact download URL and the SHA-256 digest its bytes must match. */
export interface VerifiedDownload { url: string; digest: string }

/** Fetch exactly one URL and refuse the file unless its SHA-256 matches; callers only act on the file after this returns. */
export async function downloadVerified(c: PackageContext, asset: VerifiedDownload, destination: string): Promise<void> {
  const curl = c.host.executables.get("curl");
  if (!curl) throw new Error(`curl is required to download ${asset.url}.`);
  const fetched = await c.run(curl, ["-fsSL", "--retry", "2", "-o", destination, asset.url], { quiet: true });
  if (fetched.code !== 0) throw new Error(`Download failed: ${asset.url}${fetched.stderr.trim() ? ` (${fetched.stderr.trim()})` : ""}`);
  const actual = createHash("sha256").update(await readFile(destination)).digest("hex");
  if (actual !== asset.digest) throw new Error(`${basename(destination)} failed its SHA-256 check.`);
}

/** Download a pinned archive into `directory`, verify it, confirm every pinned member is listed, then extract into `directory/unpacked`. Nothing is extracted unless all of that passes; returns the extraction root. */
export async function unpackPinnedArchive(c: PackageContext, pin: ArchivePin, directory: string): Promise<string> {
  const archive = join(directory, basename(new URL(pin.url).pathname));
  const name = basename(archive);
  await downloadVerified(c, pin, archive);
  const tar = c.host.executables.get("tar");
  if (!tar) throw new Error(`tar is required to unpack ${name}.`);
  const listing = await c.run(tar, ["-tf", archive], { quiet: true });
  if (listing.code !== 0) throw new Error(`${name} could not be listed: ${listing.stderr.trim()}`);
  const entries = new Set(listing.stdout.split("\n").map(line => line.replace(/^\.\//, "")));
  const absent = pin.members.find(member => !entries.has(member));
  if (absent) throw new Error(`${name} has no ${absent} entry.`);
  const unpacked = join(directory, "unpacked");
  await mkdir(unpacked);
  const extracted = await c.run(tar, ["-xf", archive, "-C", unpacked], { quiet: true });
  if (extracted.code !== 0) throw new Error(`${name} could not be unpacked: ${extracted.stderr.trim()}`);
  return unpacked;
}

/** Publish `files` as one unit: stage each copy beside its destination, move every replaced file into the backup tree, then run `verify`. Any failure restores the previous files. */
export async function publishExecutables(c: PackageContext, files: readonly { source: string; destination: string }[], verify: () => Promise<void>): Promise<void> {
  const stamp = `${process.pid}-${randomBytes(5).toString("hex")}`;
  const items = files.map(file => ({ ...file, stage: `${file.destination}.stage-${stamp}` }));
  const published: Array<{ destination: string; backup?: string }> = [];
  try {
    for (const item of items) {
      await mkdir(dirname(item.destination), { recursive: true });
      await copyFile(item.source, item.stage);
      await chmod(item.stage, 0o755);
    }
    for (const item of items) {
      let backup: string | undefined;
      if (await lstat(item.destination).then(() => true, () => false)) {
        if (!c.backupUserFile) throw new Error(`Cannot replace ${item.destination}; user-file backup support is unavailable.`);
        backup = await c.backupUserFile(item.destination);
      }
      published.push(backup ? { destination: item.destination, backup } : { destination: item.destination });
      await rename(item.stage, item.destination);
    }
    await verify();
  } catch (error) {
    const stuck: string[] = [];
    for (const { destination, backup } of published.reverse()) {
      await rm(destination, { force: true }).catch(() => undefined);
      if (backup) await rename(backup, destination).catch(() => { stuck.push(backup); });
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(stuck.length ? `${reason}; could not restore ${stuck.join(", ")}` : reason);
  } finally {
    await Promise.all(items.map(item => rm(item.stage, { force: true }).catch(() => undefined)));
  }
}
