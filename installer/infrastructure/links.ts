import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, cp, lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink } from "node:fs/promises";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
export type LinkResult = "changed" | "unchanged";

export interface LinkOptions {
  home?: string;
  onBackup?: (path: string) => void;
}

/** Collision-safe user-file links. The backup directory is created only on replacement. */
export class UserFileLinks {
  readonly home: string;
  private backupPath?: string;

  constructor(options: LinkOptions = {}) {
    this.home = resolve(options.home ?? process.env.HOME ?? "");
    if (!this.home || this.home === resolve(".")) {
      if (!options.home && !process.env.HOME) throw new Error("HOME is required for user-file links");
    }
    this.onBackup = options.onBackup;
  }

  private readonly onBackup?: (path: string) => void;

  get backupDirectory(): string | undefined {
    return this.backupPath;
  }

  async ensureLink(source: string, destination: string): Promise<LinkResult> {
    const src = resolve(source);
    const dst = resolve(destination);
    // Validate the source before creating parents, backups, or moving the destination.
    await access(src, constants.F_OK);
    const sourceReal = await realpath(src);
    await mkdir(dirname(dst), { recursive: true });

    const existing = await maybeLstat(dst);
    if (existing?.isSymbolicLink()) {
      const target = await readlink(dst);
      const resolvedTarget = resolve(dirname(dst), target);
      if (resolvedTarget === src || resolvedTarget === sourceReal) return "unchanged";
    }

    let savedAt: string | undefined;
    if (existing) savedAt = await this.backup(dst);
    try {
      await symlink(src, dst);
    } catch (error) {
      if (savedAt) {
        try {
          await this.restore(savedAt, dst);
        } catch (restoreError) {
          throw new Error(`Could not create link ${dst}; original remains at ${savedAt}; restoration failed: ${message(restoreError)}`, { cause: error });
        }
      }
      throw new Error(`Could not create link ${dst}${savedAt ? `; original restored from ${savedAt}` : ""}: ${message(error)}`, { cause: error });
    }
    return "changed";
  }

  /** Preserve an existing destination in the private backup tree and remove it only after copy succeeds. */
  async backup(destination: string): Promise<string> {
    const dst = resolve(destination);
    const item = await lstat(dst);
    const backupRoot = await this.ensureBackupDirectory();
    const stored = this.backupName(dst);
    const backupPath = resolve(backupRoot, stored);
    await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
    try {
      await rename(dst, backupPath);
    } catch (error) {
      if (!isCrossDevice(error)) throw new Error(`Could not back up ${dst}: ${message(error)}`, { cause: error });
      try {
        await copyWithoutDereference(dst, backupPath, item);
        await rm(dst, { recursive: true, force: false });
      } catch (copyError) {
        await rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
        throw new Error(`Could not back up ${dst}; destination was left untouched: ${message(copyError)}`, { cause: copyError });
      }
    }
    this.onBackup?.(backupPath);
    return backupPath;
  }

  private async restore(savedAt: string, destination: string): Promise<void> {
    await mkdir(dirname(destination), { recursive: true });
    try {
      await rename(savedAt, destination);
    } catch (error) {
      if (!isCrossDevice(error)) throw error;
      const item = await lstat(savedAt);
      await copyWithoutDereference(savedAt, destination, item);
      await rm(savedAt, { recursive: true, force: false });
    }
  }

  private async ensureBackupDirectory(): Promise<string> {
    if (this.backupPath) return this.backupPath;
    for (let attempt = 0; attempt < 10; attempt++) {
      const suffix = `${Date.now()}-${randomBytes(6).toString("hex")}`;
      const candidate = resolve(this.home, `.dotfiles-backup-${suffix}`);
      try {
        await mkdir(candidate, { mode: 0o700 });
        await chmod(candidate, 0o700);
        this.backupPath = candidate;
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    throw new Error("Could not allocate a unique dotfiles backup directory");
  }

  private backupName(destination: string): string {
    const rel = relative(this.home, destination);
    if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return rel;
    // Keep system paths beneath a distinct tree while retaining their hierarchy.
    return `_external${destination}`;
  }
}

export async function ensureLink(source: string, destination: string, options: LinkOptions = {}): Promise<LinkResult> {
  return new UserFileLinks(options).ensureLink(source, destination);
}

export async function backupUserFile(destination: string, options: LinkOptions = {}): Promise<string> {
  return new UserFileLinks(options).backup(destination);
}

/** Refuse OMP config changes through a user-owned agent-directory symlink. */
export async function assertOmpAgentDirectoryIsReal(home: string): Promise<void> {
  const agentDirectory = resolve(home, ".omp", "agent");
  const info = await maybeLstat(agentDirectory);
  if (info?.isSymbolicLink()) {
    throw new Error(`${agentDirectory} is a symlink; repair the OMP agent directory before linking configuration. Existing agent state was not migrated.`);
  }
}

/** Return backup filenames containing credential-shaped data; matched bytes are never exposed. */
export async function scanBackupForCredentials(backupDirectory: string): Promise<readonly string[]> {
  const patterns = [
    /sk-[A-Za-z0-9]{10,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /BEGIN (?:RSA|OPENSSH|PGP) PRIVATE KEY/,
    /AKIA[0-9A-Z]{16}/,
  ];
  const matches: string[] = [];
  const pending = [resolve(backupDirectory)];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile()) {
        const bytes = await readFile(path);
        if (patterns.some((pattern) => pattern.test(bytes.toString("utf8")))) matches.push(path);
      }
    }
  }
  return matches;
}
export interface MigrationResult {
  migrated: boolean;
  conflict: boolean;
}

/** Preserve backed-up Git identity data only when the local override path is wholly absent. */
export async function migrateGitIdentity(backupFile: string, home: string): Promise<MigrationResult> {
  const destination = resolve(home, ".gitconfig.local");
  if (await maybeLstat(destination)) return { migrated: false, conflict: true };
  const sourceInfo = await lstat(backupFile);
  if (!sourceInfo.isFile()) throw new Error(`Git configuration backup is not a regular file: ${backupFile}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(backupFile, destination, constants.COPYFILE_EXCL);
  try {
    await chmod(destination, 0o600);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  return { migrated: true, conflict: false };
}

/** Move a backed-up zsh local override into the repository's ignored location without overwriting. */
export async function migrateZshLocal(backupDirectory: string, repositoryRoot: string): Promise<MigrationResult> {
  const source = resolve(backupDirectory, ".config", "zsh", "local.zsh");
  const destination = resolve(repositoryRoot, "zsh", ".config", "zsh", "local.zsh");
  if (await maybeLstat(destination)) return { migrated: false, conflict: true };
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile()) throw new Error(`Zsh local backup is not a regular file: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  try {
    await chmod(destination, 0o600);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  return { migrated: true, conflict: false };
}

async function copyWithoutDereference(source: string, destination: string, item: Stats): Promise<void> {
  if (item.isSymbolicLink()) {
    await symlink(await readlink(source), destination);
    return;
  }
  if (item.isDirectory()) {
    await cp(source, destination, { recursive: true, dereference: false, preserveTimestamps: true, verbatimSymlinks: true });
    await chmod(destination, item.mode & 0o7777);
    return;
  }
  if (item.isFile()) {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    await chmod(destination, item.mode & 0o7777);
    return;
  }
  throw new Error(`Unsupported filesystem object at ${source}`);
}

async function maybeLstat(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isCrossDevice(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EXDEV";
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
