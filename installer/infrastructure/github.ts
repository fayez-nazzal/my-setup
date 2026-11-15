import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import type { UserFileLinks } from "./links";
import type { RecipeContext, ToolResult } from "./tools";

const result = (id: string, status: ToolResult["status"], ...attention: string[]): ToolResult => ({ id, status, attention });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * Where signing settings go: ~/.gitconfig.local when the global file includes it or is this repository's
 * tracked git/.gitconfig (whose writes would land in a public file); otherwise the user's own ~/.gitconfig.
 */
export async function gitConfigTarget(c: RecipeContext, git: string): Promise<string[]> {
  const local = join(c.home, ".gitconfig.local");
  const includes = await c.run(git, ["config", "--global", "--get-all", "include.path"], { quiet: true, stdin: "ignore" });
  const included = includes.stdout.split("\n").map(line => line.trim()).some(path => path === "~/.gitconfig.local" || path === local);
  const global = await realpath(join(c.home, ".gitconfig")).catch(() => "");
  return included || global.startsWith(`${await realpath(c.repoRoot).catch(() => c.repoRoot)}${sep}`) ? ["--file", local] : ["--global"];
}

const defaultsMarkers = ["# >>> my-setup repository defaults (managed; edit git/.gitconfig)", "# <<< my-setup repository defaults"] as const;
const localMarkers = ["# >>> my-setup local overrides (managed; loads last; edit ~/.gitconfig.local)", "# <<< my-setup local overrides"] as const;
const identityKeys = ["user.name", "user.email"] as const;

/** A condition the user must fix before the installer touches anything; messages name the fix, never a config value. */
class Blocked extends Error {}
const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";
const lines = (text: string) => { const rows = text.split("\n"); if (rows.at(-1) === "") rows.pop(); return rows; };

/** The include line git itself writes, so quoting and escaping match what git reads back. */
async function includeLines(c: RecipeContext, git: string, path: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "my-setup-include-"));
  try {
    const file = join(dir, "include");
    const added = await c.run(git, ["config", "--file", file, "--add", "include.path", path], { quiet: true, stdin: "ignore" });
    if (added.code !== 0) throw new Blocked(`git could not write an include line: ${firstLine(added.stderr)}`);
    return lines(await readFile(file, "utf8"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Remove one managed block; `at` is where it stood among the remaining rows (undefined when absent). */
function takeBlock(rows: string[], markers: readonly [string, string], path: string): { rows: string[]; at?: number } {
  const opens = rows.filter(row => row === markers[0]).length;
  const closes = rows.filter(row => row === markers[1]).length;
  if (opens === 0 && closes === 0) return { rows };
  const start = rows.indexOf(markers[0]), stop = rows.indexOf(markers[1]);
  if (opens !== 1 || closes !== 1 || stop < start) throw new Blocked(`${path} has a damaged my-setup block (missing or duplicate marker lines); remove the my-setup marker lines and rerun.`);
  return { rows: [...rows.slice(0, start), ...rows.slice(stop + 1)], at: start };
}

/** Repository defaults first, the user's own lines in place, ~/.gitconfig.local last so later global writes still win over the defaults. */
function compose(path: string, text: string, defaults: string[], local: string[]): string {
  const head = takeBlock(lines(text), defaultsMarkers, path);
  const tail = takeBlock(head.rows, localMarkers, path);
  const at = tail.at ?? tail.rows.length;
  const block = (markers: readonly [string, string], rows: string[]) => [markers[0], ...rows, markers[1]];
  return [...block(defaultsMarkers, defaults), ...tail.rows.slice(0, at), ...block(localMarkers, local), ...tail.rows.slice(at), ""].join("\n");
}

/** A private staging file beside `path`, so rename publishes it on the same filesystem. */
async function stage(path: string, text: string): Promise<string> {
  const staged = join(dirname(path), `${basename(path)}.my-setup-${randomBytes(6).toString("hex")}`);
  await writeFile(staged, text, { mode: 0o600, flag: "wx" });
  return staged;
}

/** Back up the existing entry, then rename the staged file into place; the entry is restored if the rename fails. */
async function publish(files: UserFileLinks, staged: string, path: string): Promise<string | undefined> {
  await chmod(staged, 0o600);
  const saved = await lstat(path).then(() => files.backup(path), () => undefined);
  try {
    await rename(staged, path);
  } catch (error) {
    if (saved) await rename(saved, path).catch((restore: unknown) => { throw new Error(`could not publish ${path} (${message(error)}) and could not restore ${saved}: ${message(restore)}`); });
    throw error;
  }
  return saved;
}

/** Git's effective identity through ~/.gitconfig with includes followed; values stay in memory and are never logged. */
async function effectiveIdentity(c: RecipeContext, git: string): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const key of identityKeys) {
    const got = await c.run(git, ["config", "--global", "--includes", "--get", key], { quiet: true, stdin: "ignore" });
    if (got.code === 0) values.set(key, got.stdout.replace(/\n$/, ""));
    else if (got.code !== 1) throw new Blocked(`git could not read ${key}: ${firstLine(got.stderr)}`);
  }
  return values;
}

async function localValue(c: RecipeContext, git: string, local: string, key: string): Promise<string | undefined> {
  const got = await c.run(git, ["config", "--file", local, "--get", key], { quiet: true, stdin: "ignore" });
  if (got.code === 0) return got.stdout.replace(/\n$/, "");
  if (got.code === 1) return undefined;
  throw new Blocked(`git could not read ${local}: ${firstLine(got.stderr)}; fix it and rerun.`);
}

/** Identity keys ~/.gitconfig.local must receive from the old link: those it lacks. A differing local value is kept. */
async function identityMoves(c: RecipeContext, git: string, local: string): Promise<{ moves: Map<string, string>; missing: string[]; kept: string[] }> {
  const effective = await effectiveIdentity(c, git);
  const entry = await lstat(local).catch(() => undefined);
  const moves = new Map<string, string>(), missing: string[] = [], kept: string[] = [];
  for (const key of identityKeys) {
    const value = effective.get(key);
    if (value === undefined) { missing.push(key); continue; }
    const present = entry ? await localValue(c, git, local, key) : undefined;
    if (present === undefined) moves.set(key, value);
    else if (present !== value) kept.push(key);
  }
  if (moves.size > 0 && entry && !entry.isFile()) throw new Blocked(`${local} is not a regular file, so the identity cannot be written safely; replace it with a regular file or remove it, then rerun.`);
  return { moves, missing, kept };
}

/** Write the moved identity into a staged copy of ~/.gitconfig.local, then publish it; returns the backup of the previous file. */
async function writeIdentity(c: RecipeContext, git: string, files: UserFileLinks, local: string, moves: ReadonlyMap<string, string>): Promise<string | undefined> {
  const entry = await lstat(local).catch(() => undefined);
  const staged = await stage(local, entry?.isFile() ? await readFile(local, "utf8") : "");
  try {
    for (const [key, value] of moves) {
      const set = await c.run(git, ["config", "--file", staged, key, value], { quiet: true, stdin: "ignore" });
      if (set.code !== 0) throw new Blocked(`git could not write ${key} to ${local}: ${firstLine(set.stderr)}`);
    }
    return await publish(files, staged, local);
  } finally {
    await rm(staged, { force: true });
  }
}

/**
 * ~/.gitconfig becomes a private wrapper: the tracked git/.gitconfig first, the user's own lines in place, ~/.gitconfig.local last.
 * A legacy symlink to the tracked file is replaced; its identity moves into ~/.gitconfig.local where that file lacks it.
 */
export async function configureGitDefaults(c: RecipeContext, files: UserFileLinks): Promise<ToolResult> {
  const git = c.host.executables.get("git");
  if (!git) return result("git-config", "blocked", "git is not installed; select git and rerun.");
  const globalPath = join(c.home, ".gitconfig");
  const localPath = join(c.home, ".gitconfig.local");
  const defaultsPath = join(c.repoRoot, "git", ".gitconfig");
  const attention: string[] = [];
  let localSaved: string | undefined, localChanged = false, globalPublished = false;
  try {
    const entry = await lstat(globalPath).catch(() => undefined);
    let text = "", legacy = false;
    if (entry?.isSymbolicLink()) {
      const target = await realpath(globalPath).catch(() => undefined);
      if (target === undefined) throw new Blocked(`${globalPath} is a dangling symlink; remove it or replace it with a regular file, then rerun.`);
      if (target !== await realpath(defaultsPath).catch(() => undefined)) throw new Blocked(`${globalPath} is a symlink to ${target}, not to this repository's git/.gitconfig; move it aside or replace it with a regular file, then rerun.`);
      legacy = true;
    } else if (entry?.isFile()) {
      text = await readFile(globalPath, "utf8");
    } else if (entry) {
      throw new Blocked(`${globalPath} is neither a regular file nor a symlink; move it aside and rerun.`);
    }
    if (legacy) {
      const plan = await identityMoves(c, git, localPath);
      if (plan.moves.size > 0) {
        localSaved = await writeIdentity(c, git, files, localPath, plan.moves);
        localChanged = true;
        attention.push(`Moved ${[...plan.moves.keys()].join(", ")} from the old ~/.gitconfig link into ~/.gitconfig.local.`);
      }
      if (plan.kept.length) attention.push(`${plan.kept.join(", ")} in ~/.gitconfig.local differs from the old link; kept the local value.`);
      if (plan.missing.length) attention.push(`Not set in ~/.gitconfig or ~/.gitconfig.local: ${plan.missing.join(", ")}. Set them with git config --file ~/.gitconfig.local <key> <value>.`);
    }
    const staged = await stage(globalPath, text);
    try {
      const listed = await c.run(git, ["config", "--file", staged, "--list"], { quiet: true, stdin: "ignore" });
      if (listed.code !== 0) throw new Blocked(`${globalPath} is not valid Git configuration (${firstLine(listed.stderr)}); fix it and rerun.`);
      for (const path of [defaultsPath, localPath].flatMap(file => file.startsWith(`${c.home}${sep}`) ? [file, `~${file.slice(c.home.length)}`] : [file])) {
        const removed = await c.run(git, ["config", "--file", staged, "--fixed-value", "--unset-all", "include.path", path], { quiet: true, stdin: "ignore" });
        if (removed.code !== 0 && removed.code !== 5) throw new Blocked(`git could not remove an include from ${globalPath}: ${firstLine(removed.stderr)}`);
      }
      const cleaned = await readFile(staged, "utf8");
      const next = compose(globalPath, cleaned, await includeLines(c, git, defaultsPath), await includeLines(c, git, localPath));
      if (entry?.isFile() && next === text) return result("git-config", "unchanged");
      await writeFile(staged, next);
      const saved = await publish(files, staged, globalPath);
      globalPublished = true;
      if (saved) attention.push(`Previous ~/.gitconfig saved to ${saved}.`);
      return result("git-config", "changed", ...attention);
    } finally {
      await rm(staged, { force: true });
    }
  } catch (error) {
    let detail = message(error);
    if (localChanged && !globalPublished) {
      await (localSaved ? rename(localSaved, localPath) : rm(localPath, { force: true })).catch((restore: unknown) => { detail += `; restoring ~/.gitconfig.local also failed: ${message(restore)}`; });
    }
    return result("git-config", error instanceof Blocked ? "blocked" : "failed", detail);
  }
}
