import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commands } from "./commands";
import { gitConfigTarget } from "./github";
import type { RecipeContext } from "./tools";

const git = Bun.which("git");
const scratch: string[] = [];
afterEach(async () => { for (const path of scratch.splice(0)) await rm(path, { recursive: true, force: true }); });

async function fixture(globalConfig: (home: string, repo: string) => Promise<void>): Promise<RecipeContext> {
  const root = await mkdtemp(join(tmpdir(), "signing-target-")); scratch.push(root);
  const home = join(root, "home"), repo = join(root, "repo");
  await mkdir(home); await mkdir(join(repo, "git"), { recursive: true });
  await globalConfig(home, repo);
  const host = { platform: "linux" as const, architecture: "x64" as const, home, repositoryRoot: repo, executables: new Map(), packageManagers: {}, gnome: { active: false }, graphical: true, macOS: {} };
  // git resolves --global and `~` in include.path from HOME; isolate both from the real account.
  return { host, home, repoRoot: repo, ensureLink: async () => "unchanged", run: (command, args, options) => commands.run(command, args, { ...options, env: { HOME: home, XDG_CONFIG_HOME: join(home, ".config"), ...options?.env } }) };
}

describe.skipIf(!git)("signing settings target", () => {
  test("a ~/.gitconfig linked to the tracked repository file never receives writes, even without the include", async () => {
    const c = await fixture(async (home, repo) => {
      await writeFile(join(repo, "git/.gitconfig"), "[user]\n\tname = Example\n");
      await symlink(join(repo, "git/.gitconfig"), join(home, ".gitconfig"));
    });
    expect(await gitConfigTarget(c, git!)).toEqual(["--file", join(c.home, ".gitconfig.local")]);
  });
  test("an untracked ~/.gitconfig that includes ~/.gitconfig.local routes writes to the local file", async () => {
    const c = await fixture(async home => { await writeFile(join(home, ".gitconfig"), "[include]\n\tpath = ~/.gitconfig.local\n"); });
    expect(await gitConfigTarget(c, git!)).toEqual(["--file", join(c.home, ".gitconfig.local")]);
  });
  test("an untracked ~/.gitconfig without the include is written directly so the values apply", async () => {
    const c = await fixture(async home => { await writeFile(join(home, ".gitconfig"), "[user]\n\tname = Example\n"); });
    expect(await gitConfigTarget(c, git!)).toEqual(["--global"]);
  });
});
