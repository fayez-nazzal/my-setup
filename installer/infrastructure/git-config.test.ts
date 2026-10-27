import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, rmSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { commands } from "./commands";
import { configureGitDefaults, gitConfigTarget } from "./github";
import { UserFileLinks } from "./links";
import type { RecipeContext } from "./tools";

const git = Bun.which("git");
const scratch: string[] = [];
afterEach(async () => { for (const path of scratch.splice(0)) await rm(path, { recursive: true, force: true }); });

const defaults = "[init]\n\tdefaultBranch = main\n[alias]\n\tst = status -sb\n";
const trackedRepo = join(import.meta.dir, "..", "..");
const isolated = (home: string) => ({ HOME: home, XDG_CONFIG_HOME: join(home, ".config"), GIT_CONFIG_NOSYSTEM: "1" });
const gitIn = (home: string, args: string[]) => commands.run(git!, args, { quiet: true, stdin: "ignore", env: isolated(home) });
// --includes is required for --global reads to follow the wrapper's include directives.
const globalGet = async (home: string, key: string) => (await gitIn(home, ["config", "--global", "--includes", "--get", key])).stdout.trim();
const modeOf = async (path: string) => (await lstat(path)).mode & 0o777;
const absent = (path: string) => lstat(path).then(() => false, () => true);

type Setup = (home: string, repo: string) => Promise<void>;

/** Isolated HOME and repository; the repository's git/.gitconfig starts as portable defaults only. */
async function fixture(setup: Setup = async () => {}, options: { repoName?: string; onBackup?: (path: string) => void } = {}) {
  const root = await mkdtemp(join(tmpdir(), "git-config-")); scratch.push(root);
  const home = join(root, "home"), repo = join(root, options.repoName ?? "repo");
  await mkdir(home); await mkdir(join(repo, "git"), { recursive: true });
  await writeFile(join(repo, "git", ".gitconfig"), defaults);
  await setup(home, repo);
  const host = { platform: "linux" as const, architecture: "x64" as const, home, repositoryRoot: repo, executables: new Map([["git", git!]]), packageManagers: {}, gnome: { active: false }, graphical: true, macOS: {} };
  const c: RecipeContext = { host, home, repoRoot: repo, ensureLink: async () => "unchanged", run: (command, args, opts) => commands.run(command, args, { ...opts, env: { ...isolated(home), ...opts?.env } }) };
  const files = new UserFileLinks({ home, onBackup: options.onBackup });
  return { root, home, repo, c, files };
}

describe.skipIf(!git)("git configuration wrapper", () => {
  test("an absent ~/.gitconfig becomes a private wrapper; repository defaults load first and ~/.gitconfig.local last", async () => {
    const f = await fixture();
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("changed");
    const global = join(f.home, ".gitconfig");
    expect((await lstat(global)).isSymbolicLink()).toBe(false);
    expect(await modeOf(global)).toBe(0o600);
    expect(await globalGet(f.home, "alias.st")).toBe("status -sb");
    await writeFile(join(f.home, ".gitconfig.local"), "[alias]\n\tst = local-wins\n");
    expect(await globalGet(f.home, "alias.st")).toBe("local-wins");
    await gitIn(f.home, ["config", "--global", "alias.st", "global-wins"]);
    expect(await globalGet(f.home, "alias.st")).toBe("global-wins");
  });

  test("a legacy symlink to the tracked file is replaced; its identity moves into a new ~/.gitconfig.local", async () => {
    const f = await fixture(async (home, repo) => {
      await writeFile(join(repo, "git", ".gitconfig"), `${defaults}[user]\n\tname = Synthetic Name\n\temail = synthetic@example.test\n`);
      await symlink(join(repo, "git", ".gitconfig"), join(home, ".gitconfig"));
    });
    const result = await configureGitDefaults(f.c, f.files);
    expect(result.status).toBe("changed");
    expect(result.attention.join("\n")).toContain("user.name, user.email");
    expect(result.attention.join("\n")).not.toContain("Synthetic Name");
    expect((await lstat(join(f.home, ".gitconfig"))).isSymbolicLink()).toBe(false);
    const local = join(f.home, ".gitconfig.local");
    expect(await modeOf(local)).toBe(0o600);
    expect((await gitIn(f.home, ["config", "--file", local, "--get", "user.name"])).stdout.trim()).toBe("Synthetic Name");
    expect(await globalGet(f.home, "user.email")).toBe("synthetic@example.test");
    expect(await readlink(join(f.files.backupDirectory!, ".gitconfig"))).toBe(join(f.repo, "git", ".gitconfig"));
  });

  test("a differing local identity is kept, and attention names only the key", async () => {
    const f = await fixture(async (home, repo) => {
      await writeFile(join(repo, "git", ".gitconfig"), `${defaults}[user]\n\tname = Synthetic Name\n\temail = synthetic@example.test\n`);
      await symlink(join(repo, "git", ".gitconfig"), join(home, ".gitconfig"));
      await writeFile(join(home, ".gitconfig.local"), "[user]\n\tname = Local Name\n");
    });
    const result = await configureGitDefaults(f.c, f.files);
    expect(result.status).toBe("changed");
    expect(result.attention.join("\n")).toContain("user.name in ~/.gitconfig.local differs");
    expect(result.attention.join("\n")).not.toContain("Local Name");
    const local = join(f.home, ".gitconfig.local");
    expect((await gitIn(f.home, ["config", "--file", local, "--get", "user.name"])).stdout.trim()).toBe("Local Name");
    expect((await gitIn(f.home, ["config", "--file", local, "--get", "user.email"])).stdout.trim()).toBe("synthetic@example.test");
  });

  test("a legacy link without identity creates no local file and names the missing keys in attention", async () => {
    const f = await fixture(async (home, repo) => {
      await symlink(join(repo, "git", ".gitconfig"), join(home, ".gitconfig"));
    });
    const result = await configureGitDefaults(f.c, f.files);
    expect(result.status).toBe("changed");
    expect(result.attention.join("\n")).toContain("user.name, user.email");
    expect(await absent(join(f.home, ".gitconfig.local"))).toBe(true);
  });

  test("a local symlink blocks the identity move and leaves both links untouched", async () => {
    const f = await fixture(async (home, repo) => {
      await writeFile(join(repo, "git", ".gitconfig"), `${defaults}[user]\n\tname = Synthetic Name\n`);
      await symlink(join(repo, "git", ".gitconfig"), join(home, ".gitconfig"));
      await symlink(join(home, "missing-target"), join(home, ".gitconfig.local"));
    });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("blocked");
    expect(await readlink(join(f.home, ".gitconfig"))).toBe(join(f.repo, "git", ".gitconfig"));
    expect(await readlink(join(f.home, ".gitconfig.local"))).toBe(join(f.home, "missing-target"));
    expect(f.files.backupDirectory).toBeUndefined();
  });

  test("a regular ~/.gitconfig keeps its own lines and drops only the wrapper's own includes", async () => {
    const original = "[credential]\n\thelper = store\n[includeIf \"gitdir:/tmp/work/\"]\n\tpath = /tmp/work.gitconfig\n[include]\n\tpath = ~/.gitconfig.local\n[include]\n\tpath = /old/checkout/git/.gitconfig\n[user]\n\tname = Synthetic Name\n";
    const f = await fixture(async home => { await writeFile(join(home, ".gitconfig"), original); });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("changed");
    const global = join(f.home, ".gitconfig");
    expect((await gitIn(f.home, ["config", "--file", global, "--get-all", "include.path"])).stdout.trim().split("\n"))
      .toEqual([join(f.repo, "git", ".gitconfig"), "/old/checkout/git/.gitconfig", join(f.home, ".gitconfig.local")]);
    expect(await globalGet(f.home, "credential.helper")).toBe("store");
    expect(await globalGet(f.home, "user.name")).toBe("Synthetic Name");
    expect(await readFile(join(f.files.backupDirectory!, ".gitconfig"), "utf8")).toBe(original);
  });

  test("a rerun is unchanged, keeps one managed block of each kind, and keeps a later global write", async () => {
    const f = await fixture(async home => { await writeFile(join(home, ".gitconfig"), "[credential]\n\thelper = store\n"); });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("changed");
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("unchanged");
    await gitIn(f.home, ["config", "--global", "http.extraHeader", "fixture-not-a-secret"]);
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("unchanged");
    const text = await readFile(join(f.home, ".gitconfig"), "utf8");
    expect(text.split("# >>> my-setup repository defaults").length - 1).toBe(1);
    expect(text.split("# >>> my-setup local overrides").length - 1).toBe(1);
    expect(await globalGet(f.home, "http.extraHeader")).toBe("fixture-not-a-secret");
  });

  test("malformed global configuration is blocked and left untouched", async () => {
    const broken = "[user\n\tname = Broken\n";
    const f = await fixture(async home => { await writeFile(join(home, ".gitconfig"), broken); });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("blocked");
    expect(await readFile(join(f.home, ".gitconfig"), "utf8")).toBe(broken);
    expect(f.files.backupDirectory).toBeUndefined();
  });

  test("a symlink to anything other than the tracked file is blocked and untouched", async () => {
    const f = await fixture(async (home, repo) => {
      await writeFile(join(repo, "..", "other.gitconfig"), "[user]\n\tname = Elsewhere\n");
      await symlink(join(repo, "..", "other.gitconfig"), join(home, ".gitconfig"));
    });
    const result = await configureGitDefaults(f.c, f.files);
    expect(result.status).toBe("blocked");
    expect(await readlink(join(f.home, ".gitconfig"))).toBe(join(f.root, "other.gitconfig"));
    expect(f.files.backupDirectory).toBeUndefined();
  });

  test("a dangling symlink is blocked and untouched", async () => {
    const f = await fixture(async home => { await symlink(join(home, "missing"), join(home, ".gitconfig")); });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("blocked");
    expect(await readlink(join(f.home, ".gitconfig"))).toBe(join(f.home, "missing"));
  });

  test("a directory at ~/.gitconfig is blocked and untouched", async () => {
    const f = await fixture(async home => { await mkdir(join(home, ".gitconfig")); });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("blocked");
    expect((await lstat(join(f.home, ".gitconfig"))).isDirectory()).toBe(true);
  });

  test("a repository path with spaces, #, quotes, and a backslash resolves through the wrapper", async () => {
    const f = await fixture(undefined, { repoName: "repo \"q\" # s\\x" });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("changed");
    expect(await globalGet(f.home, "alias.st")).toBe("status -sb");
  });

  test("after installation, signing and identity writes route to ~/.gitconfig.local", async () => {
    const f = await fixture();
    await configureGitDefaults(f.c, f.files);
    expect(await gitConfigTarget(f.c, git!)).toEqual(["--file", join(f.home, ".gitconfig.local")]);
  });

  test("a failed publish restores the legacy link and removes the ~/.gitconfig.local it just wrote", async () => {
    let home = "";
    const f = await fixture(async (dir, repo) => {
      home = dir;
      await writeFile(join(repo, "git", ".gitconfig"), `${defaults}[user]\n\tname = Synthetic Name\n`);
      await symlink(join(repo, "git", ".gitconfig"), join(dir, ".gitconfig"));
    }, {
      // Simulate the staged file vanishing before publish: the rename then fails after the link was backed up.
      onBackup: path => {
        if (basename(path) !== ".gitconfig") return;
        for (const name of readdirSync(home)) if (name.startsWith(".gitconfig.my-setup-")) rmSync(join(home, name));
      },
    });
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("failed");
    expect(await readlink(join(f.home, ".gitconfig"))).toBe(join(f.repo, "git", ".gitconfig"));
    expect(await absent(join(f.home, ".gitconfig.local"))).toBe(true);
  });

  test("never writes the tracked git/.gitconfig", async () => {
    const tracked = join(trackedRepo, "git", ".gitconfig");
    const before = await readFile(tracked, "utf8");
    const f = await fixture();
    expect((await configureGitDefaults({ ...f.c, repoRoot: trackedRepo }, f.files)).status).toBe("changed");
    expect(await readFile(tracked, "utf8")).toBe(before);
  });

  test("blocks when git is not installed and creates nothing", async () => {
    const f = await fixture();
    f.c.host.executables.delete("git");
    expect((await configureGitDefaults(f.c, f.files)).status).toBe("blocked");
    expect(await absent(join(f.home, ".gitconfig"))).toBe(true);
  });

  // Expected to fail until the identity is removed from the tracked git/.gitconfig.
  test("the tracked git/.gitconfig carries no identity", async () => {
    const found = await commands.run(git!, ["config", "--file", join(trackedRepo, "git", ".gitconfig"), "--get", "user.email"], { quiet: true, stdin: "ignore" });
    expect(found.code).toBe(1);
  });
});
