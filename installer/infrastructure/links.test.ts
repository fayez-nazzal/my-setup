import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readlink, lstat, rm, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { assertOmpAgentDirectoryIsReal, migrateGitIdentity, migrateZshLocal, UserFileLinks } from "./links";
let root: string;
let home: string;
let source: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "links-test-"));
  home = join(root, "home");
  source = join(root, "repo", "config");
  await mkdir(home);
  await mkdir(join(root, "repo"));
  await writeFile(source, "new configuration\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("UserFileLinks", () => {
  test("links absent and correctly-targeted relative destinations without a backup", async () => {
    const destination = join(home, ".config", "app.conf");
    const links = new UserFileLinks({ home });
    expect(await links.ensureLink(source, destination)).toBe("changed");
    await rm(destination);
    await symlink(relative(join(home, ".config"), source), destination);
    expect(await links.ensureLink(source, destination)).toBe("unchanged");
    expect(links.backupDirectory).toBeUndefined();
  });

  test("backs up real files, directories, wrong links, and dangling links", async () => {
    const links = new UserFileLinks({ home });
    const file = join(home, ".gitconfig");
    await writeFile(file, "identity data");
    await chmod(file, 0o640);
    expect(await links.ensureLink(source, file)).toBe("changed");
    const backedFile = join(links.backupDirectory!, ".gitconfig");
    expect(await readFile(backedFile, "utf8")).toBe("identity data");
    expect((await lstat(backedFile)).mode & 0o777).toBe(0o640);

    const directory = join(home, ".config", "zsh");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "local.zsh"), "local override");
    await links.ensureLink(source, directory);
    expect(await readFile(join(links.backupDirectory!, ".config", "zsh", "local.zsh"), "utf8")).toBe("local override");

    const wrong = join(home, "wrong-link");
    await symlink("missing-target", wrong);
    await links.ensureLink(source, wrong);
    expect(await readlink(join(links.backupDirectory!, "wrong-link"))).toBe("missing-target");

    const dangling = join(home, "dangling");
    await symlink("no-such-file", dangling);
    await links.ensureLink(source, dangling);
    expect(await readlink(join(links.backupDirectory!, "dangling"))).toBe("no-such-file");
    expect((await lstat(links.backupDirectory!)).mode & 0o777).toBe(0o700);
  });

  test("does not create backup or alter destination when source is missing", async () => {
    const destination = join(home, "config");
    await writeFile(destination, "keep me");
    const links = new UserFileLinks({ home });
    await expect(links.ensureLink(join(root, "missing"), destination)).rejects.toThrow();
    expect(await readFile(destination, "utf8")).toBe("keep me");
    expect(links.backupDirectory).toBeUndefined();
  });

  test("removes a retired link only while it still targets the removed repository file", async () => {
    const links = new UserFileLinks({ home });
    const retired = join(root, "repo", "bin", "old-tool");
    await mkdir(join(root, "repo", "bin"));
    const owned = join(home, "owned");
    await symlink(retired, owned);
    expect(await links.removeRetiredLink(retired, owned)).toBe("changed");
    expect(await lstat(owned).catch(() => undefined)).toBeUndefined();

    const userLink = join(home, "user-link");
    await symlink("/usr/bin/old-tool", userLink);
    const userFile = join(home, "user-file");
    await writeFile(userFile, "keep me");
    expect(await links.removeRetiredLink(retired, userLink)).toBe("unchanged");
    expect(await links.removeRetiredLink(retired, userFile)).toBe("unchanged");
    expect(await links.removeRetiredLink(retired, join(home, "absent"))).toBe("unchanged");
    expect(await readlink(userLink)).toBe("/usr/bin/old-tool");
    expect(await readFile(userFile, "utf8")).toBe("keep me");
    expect(links.backupDirectory).toBeUndefined();
  });

  test("does not overwrite a dangling git local override link", async () => {
    const links = new UserFileLinks({ home });
    const original = join(home, ".gitconfig");
    const local = join(home, ".gitconfig.local");
    await writeFile(original, "[user]\n name = preserved\n");
    await symlink("missing", local);
    const backed = await links.backup(original);
    expect(await readlink(local)).toBe("missing");
    expect(await readFile(backed, "utf8")).toContain("preserved");
  });
  test("migrates backed-up git and zsh local files with private permissions", async () => {
    const links = new UserFileLinks({ home });
    const git = join(home, ".gitconfig");
    await writeFile(git, "identity");
    const gitBackup = await links.backup(git);
    expect(await migrateGitIdentity(gitBackup, home)).toEqual({ migrated: true, conflict: false });
    expect(await readFile(join(home, ".gitconfig.local"), "utf8")).toBe("identity");
    expect((await lstat(join(home, ".gitconfig.local"))).mode & 0o777).toBe(0o600);

    const zshBackup = join(links.backupDirectory!, ".config", "zsh");
    await mkdir(zshBackup, { recursive: true });
    await writeFile(join(zshBackup, "local.zsh"), "local secret");
    const repository = join(root, "repository");
    expect(await migrateZshLocal(links.backupDirectory!, repository)).toEqual({ migrated: true, conflict: false });
    const migrated = join(repository, "zsh", ".config", "zsh", "local.zsh");
    expect(await readFile(migrated, "utf8")).toBe("local secret");
    expect((await lstat(migrated)).mode & 0o777).toBe(0o600);
  });

  test("reports migration conflicts without replacing existing local state", async () => {
    const links = new UserFileLinks({ home });
    const backup = join(home, "old.gitconfig");
    await writeFile(backup, "old identity");
    await writeFile(join(home, ".gitconfig.local"), "new identity");
    expect(await migrateGitIdentity(backup, home)).toEqual({ migrated: false, conflict: true });
    expect(await readFile(join(home, ".gitconfig.local"), "utf8")).toBe("new identity");
  });


  test("backs up directory state without traversing its symlinks", async () => {
    const links = new UserFileLinks({ home });
    const agent = join(home, ".omp", "agent");
    await mkdir(agent, { recursive: true });
    await writeFile(join(agent, "agent.db"), "state sentinel");
    await symlink("/outside/not-read", join(agent, "external"));
    await links.ensureLink(source, agent);
    const backup = join(links.backupDirectory!, ".omp", "agent");
    expect(await readFile(join(backup, "agent.db"), "utf8")).toBe("state sentinel");
    expect(await readlink(join(backup, "external"))).toBe("/outside/not-read");
  });
});
  test("refuses an OMP agent directory symlink without changing its target", async () => {
    const agent = join(home, ".omp", "agent");
    const outside = join(root, "external-agent");
    await mkdir(outside);
    await mkdir(join(home, ".omp"), { recursive: true });
    await symlink(outside, agent);
    await expect(assertOmpAgentDirectoryIsReal(home)).rejects.toThrow(/symlink/);
    expect(await readlink(agent)).toBe(outside);
  });
