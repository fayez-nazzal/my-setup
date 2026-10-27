import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Behavioral tests for tools/sync.sh signature gating: real git, real ssh-keygen, real gpg, isolated HOME.
const TOOLS = join(import.meta.dir, "../../tools");
const GIT = Bun.which("git");
const SSH_KEYGEN = Bun.which("ssh-keygen");
const GPG = Bun.which("gpg");
const GPGCONF = Bun.which("gpgconf");
const TIMEOUT = 60_000;

const scratchDirs: string[] = [];
afterEach(async () => {
  for (const dir of scratchDirs.splice(0)) {
    if (GPGCONF) await exec(GPGCONF, ["--homedir", join(dir, "gnupg"), "--kill", "all"], { PATH: process.env.PATH ?? "" });
    await rm(dir, { recursive: true, force: true });
  }
});

type Sign = { format: "ssh" | "openpgp"; key: string } | undefined;
interface Fixture {
  root: string;
  home: string;
  env: Record<string, string>;
  trust: string;
  remotes: string;
  gnupg?: string;
  keys: { ssh: string; rogueSsh: string; gpg?: string; rogueGpg?: string };
}

async function exec(cmd: string, args: string[], env: Record<string, string>, cwd?: string) {
  const proc = Bun.spawn([cmd, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

async function must(cmd: string, args: string[], env: Record<string, string>, cwd?: string): Promise<string> {
  const result = await exec(cmd, args, env, cwd);
  if (result.code !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tools-sync-"));
  scratchDirs.push(dir);
  return dir;
}

async function fixture(options: { openpgp?: boolean } = {}): Promise<Fixture> {
  const root = await scratch();
  const home = join(root, "home");
  const remotes = join(root, "remotes");
  const trust = join(home, ".config/my-setup/tool-trust");
  await mkdir(join(root, "tools"), { recursive: true });
  await mkdir(remotes, { recursive: true });
  await mkdir(trust, { recursive: true });
  await chmod(trust, 0o700);
  for (const file of ["sync.sh", "verify-gpg.sh"]) await copyFile(join(TOOLS, file), join(root, "tools", file));
  await chmod(join(root, "tools/sync.sh"), 0o755);
  await chmod(join(root, "tools/verify-gpg.sh"), 0o755);

  const env: Record<string, string> = {
    HOME: home,
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    XDG_STATE_HOME: join(home, ".local/state"),
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Owner",
    GIT_AUTHOR_EMAIL: "owner@example.invalid",
    GIT_COMMITTER_NAME: "Owner",
    GIT_COMMITTER_EMAIL: "owner@example.invalid",
  };
  await writeFile(join(home, ".gitconfig"), `[url "file://${remotes}/"]\n\tinsteadOf = https://github.com/fixture-owner/\n[init]\n\tdefaultBranch = main\n`);

  const keys: Fixture["keys"] = { ssh: join(root, "owner_ed25519"), rogueSsh: join(root, "rogue_ed25519") };
  for (const key of [keys.ssh, keys.rogueSsh]) await must(SSH_KEYGEN!, ["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f", key], env);
  const ownerPublic = (await readFile(`${keys.ssh}.pub`, "utf8")).trim();
  const allowed = join(trust, "allowed_signers");
  await writeFile(allowed, `my-setup-owner namespaces="git" ${ownerPublic}\n`);
  await chmod(allowed, 0o600);

  const result: Fixture = { root, home, env, trust, remotes, keys };
  const ownerFile = join(trust, "owner-keys.asc");
  if (options.openpgp) {
    const gnupg = join(root, "gnupg");
    await mkdir(gnupg, { mode: 0o700 });
    await chmod(gnupg, 0o700);
    const gpgEnv = { ...env, GNUPGHOME: gnupg };
    const uids = ["Owner <owner@example.invalid>", "Rogue <rogue@example.invalid>"];
    const fprs: string[] = [];
    for (const uid of uids) {
      await must(GPG!, ["--batch", "--pinentry-mode", "loopback", "--passphrase", "", "--quick-gen-key", uid, "ed25519", "default", "never"], gpgEnv);
      const listing = await must(GPG!, ["--batch", "--with-colons", "--list-keys", uid], gpgEnv);
      fprs.push(listing.split("\n").find(line => line.startsWith("fpr:"))!.split(":")[9]);
    }
    keys.gpg = fprs[0];
    keys.rogueGpg = fprs[1];
    await writeFile(ownerFile, `${await must(GPG!, ["--batch", "--armor", "--export", keys.gpg], gpgEnv)}\n`);
    result.gnupg = gnupg;
  } else {
    await writeFile(ownerFile, "");
  }
  await chmod(ownerFile, 0o600);
  return result;
}

function entry(name: string, build = true): string {
  return build
    ? `${name} | darwin linux | mkdir -p dist && cp run.sh dist/${name} | dist/${name}`
    : `${name} | darwin linux |  | `;
}

async function writeConf(f: Fixture, entries: string[]) {
  await writeFile(join(f.root, "tools/tools.conf"), [
    'GITHUB_TOOLS_OWNER="fixture-owner"',
    'GITHUB_TOOLS_DIR="$HOME/tools"',
    'GITHUB_TOOLS_BIN="$HOME/bin"',
    'GITHUB_TOOLS_PREVIOUS_DIR="$HOME/repos/tools"',
    'GITHUB_TOOLS_CRON="17 9,21 * * *"',
    "GITHUB_TOOLS=(",
    ...entries.map(line => `  "${line}"`),
    ")",
    "",
  ].join("\n"));
}

async function sync(f: Fixture): Promise<{ code: number; out: string }> {
  const result = await exec("bash", [join(f.root, "tools/sync.sh"), "sync"], f.env);
  return { code: result.code, out: result.stdout + result.stderr };
}

// Creates a bare remote named <name> and a work tree that pushes to it.
async function createRemote(f: Fixture, name: string): Promise<string> {
  const bare = join(f.remotes, `${name}.git`);
  await must("git", ["init", "-q", "--bare", "-b", "main", bare], f.env);
  const work = join(f.root, "work", name);
  await mkdir(work, { recursive: true });
  await must("git", ["init", "-q", "-b", "main", work], f.env);
  await must("git", ["remote", "add", "origin", bare], f.env, work);
  return work;
}

// Commits run.sh (which echoes `content`) and pushes it to origin/main.
async function commit(f: Fixture, work: string, sign: Sign, content: string) {
  await writeFile(join(work, "run.sh"), `#!/bin/sh\necho ${content}\n`);
  await chmod(join(work, "run.sh"), 0o755);
  await must("git", ["add", "run.sh"], f.env, work);
  const env = sign?.format === "openpgp" ? { ...f.env, GNUPGHOME: f.gnupg! } : f.env;
  const config = sign ? ["-c", `gpg.format=${sign.format}`, "-c", `user.signingkey=${sign.key}`] : [];
  await must("git", [...config, "commit", "-q", sign ? "-S" : "--no-gpg-sign", "-m", content], env, work);
  await must("git", ["push", "-q", "origin", "HEAD:main"], f.env, work);
}

const ssh = (f: Fixture): Sign => ({ format: "ssh", key: f.keys.ssh });

const checkout = (f: Fixture, name: string) => join(f.home, "tools", name);
const binary = (f: Fixture, name: string) => join(f.home, "bin", name);
const runBinary = async (f: Fixture, name: string) => (await exec(binary(f, name), [], f.env)).stdout;
const headOf = (f: Fixture, dir: string) => must("git", ["rev-parse", "HEAD"], f.env, dir);
const stagingLeft = async (f: Fixture) => existsSync(join(f.home, "tools"))
  ? (await readdir(join(f.home, "tools"))).filter(name => name.startsWith(".staging"))
  : [];

describe.skipIf(!GIT || !SSH_KEYGEN)("tools/sync.sh signature gate", () => {
  test("installs a commit signed by an enrolled SSH key, then builds and links it", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("alpha: cloned, built, linked alpha");
    expect(await runBinary(f, "alpha")).toBe("v1\n");
    expect(await stagingLeft(f)).toEqual([]);
  }, TIMEOUT);

  test("fast-forwards to a newer signed tip and never runs local hooks during the update", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    const marker = join(f.root, "hook-ran");
    await writeFile(join(checkout(f, "alpha"), ".git/hooks/post-merge"), `#!/bin/sh\ntouch ${marker}\n`);
    await chmod(join(checkout(f, "alpha"), ".git/hooks/post-merge"), 0o755);
    await commit(f, work, ssh(f), "v2");

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toMatch(/alpha: updated [0-9a-f]+\.\.[0-9a-f]+, built/);
    expect(existsSync(marker)).toBe(false);
    expect(await runBinary(f, "alpha")).toBe("v2\n");
  }, TIMEOUT);

  test("refuses an unsigned tip: nothing is checked out, built, or linked", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, undefined, "v1");
    await writeConf(f, [entry("alpha")]);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("alpha: failed: ");
    expect(run.out).toContain("has no single SSH or OpenPGP signature");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
    expect(existsSync(binary(f, "alpha"))).toBe(false);
    expect(await stagingLeft(f)).toEqual([]);
  }, TIMEOUT);

  test("refuses an SSH signature from a key that is not enrolled", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, { format: "ssh", key: f.keys.rogueSsh }, "v1");
    await writeConf(f, [entry("alpha")]);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("alpha: failed: ");
    expect(run.out).toContain("not signed by an enrolled owner key");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
    expect(existsSync(binary(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("installs a commit signed by an enrolled OpenPGP key", async () => {
    const f = await fixture({ openpgp: true });
    const work = await createRemote(f, "alpha");
    await commit(f, work, { format: "openpgp", key: f.keys.gpg! }, "v1");
    await writeConf(f, [entry("alpha")]);

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("alpha: cloned, built, linked alpha");
    expect(await runBinary(f, "alpha")).toBe("v1\n");
  }, TIMEOUT);

  test.skipIf(!GPG)("refuses an OpenPGP signature from a key that is not enrolled", async () => {
    const f = await fixture({ openpgp: true });
    const work = await createRemote(f, "alpha");
    await commit(f, work, { format: "openpgp", key: f.keys.rogueGpg! }, "v1");
    await writeConf(f, [entry("alpha")]);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("not signed by an enrolled owner key");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("an unsigned update to an existing checkout is refused and the old build stays", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    const before = await headOf(f, checkout(f, "alpha"));
    await commit(f, work, undefined, "v2");

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("alpha: failed: ");
    expect(await headOf(f, checkout(f, "alpha"))).toBe(before);
    expect(await runBinary(f, "alpha")).toBe("v1\n");
  }, TIMEOUT);

  test("an existing unsigned checkout is never built or linked", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, undefined, "v1");
    await writeConf(f, [entry("alpha")]);
    await mkdir(join(f.home, "tools"), { recursive: true });
    await must("git", ["clone", "-q", "https://github.com/fixture-owner/alpha.git", checkout(f, "alpha")], f.env);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("has no single SSH or OpenPGP signature");
    expect(existsSync(join(checkout(f, "alpha"), "dist/alpha"))).toBe(false);
    expect(existsSync(binary(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("a legacy checkout in ~/repos/tools is moved, verified, built, and linked", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    await mkdir(join(f.home, "repos/tools"), { recursive: true });
    await must("git", ["clone", "-q", "https://github.com/fixture-owner/alpha.git", join(f.home, "repos/tools/alpha")], f.env);

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("alpha: moved from ");
    expect(run.out).toContain("built, linked alpha");
    expect(existsSync(join(f.home, "repos/tools/alpha"))).toBe(false);
    expect(await runBinary(f, "alpha")).toBe("v1\n");
  }, TIMEOUT);

  test("a checkout with uncommitted changes is held: not updated, built, or linked", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    const dir = checkout(f, "alpha");
    const head = await headOf(f, dir);
    await writeFile(join(dir, "run.sh"), "#!/bin/sh\necho local\n");
    await commit(f, work, ssh(f), "v2");

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("uncommitted changes: not updated; not built or linked");
    expect(await headOf(f, dir)).toBe(head);
    expect(await runBinary(f, "alpha")).toBe("v1\n");
  }, TIMEOUT);

  test("a checkout on another branch is held: not updated, built, or linked", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    await must("git", ["checkout", "-q", "-b", "feature"], f.env, checkout(f, "alpha"));
    await commit(f, work, ssh(f), "v2");

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("on feature, not main: not updated; not built or linked");
  }, TIMEOUT);

  test("a checkout with local commits that diverge from origin is held", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    const dir = checkout(f, "alpha");
    await must("git", ["commit", "-q", "--allow-empty", "--no-gpg-sign", "-m", "local work"], f.env, dir);
    const local = await headOf(f, dir);
    await commit(f, work, ssh(f), "v2");

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("local commits diverge from origin/main: not updated; not built or linked");
    expect(await headOf(f, dir)).toBe(local);
  }, TIMEOUT);

  test("a missing build output triggers a rebuild", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    expect((await sync(f)).code).toBe(0);
    await rm(join(checkout(f, "alpha"), "dist"), { recursive: true });

    const run = await sync(f);

    expect(run.code).toBe(0);
    expect(run.out).toContain("alpha: built");
    expect(await runBinary(f, "alpha")).toBe("v1\n");
  }, TIMEOUT);

  test("a build-less extension with an unsigned tip leaves no checkout", async () => {
    const f = await fixture();
    const work = await createRemote(f, "ext");
    await commit(f, work, undefined, "v1");
    await writeConf(f, [entry("ext", false)]);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("ext: failed: ");
    expect(existsSync(checkout(f, "ext"))).toBe(false);
    expect(await stagingLeft(f)).toEqual([]);
  }, TIMEOUT);

  test("one failing tool does not stop another signed tool", async () => {
    const f = await fixture();
    const alpha = await createRemote(f, "alpha");
    await commit(f, alpha, undefined, "v1");
    const beta = await createRemote(f, "beta");
    await commit(f, beta, ssh(f), "v1");
    await writeConf(f, [entry("alpha"), entry("beta")]);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("alpha: failed: ");
    expect(run.out).toContain("beta: cloned, built, linked beta");
    expect(await runBinary(f, "beta")).toBe("v1\n");
  }, TIMEOUT);

  test("a missing trust directory fails closed", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    await rm(f.trust, { recursive: true });

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("trust material missing");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("an allowed_signers file with group or world access fails closed", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    await chmod(join(f.trust, "allowed_signers"), 0o644);

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("trust material unsafe");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("a symlinked trust file fails closed", async () => {
    const f = await fixture();
    const work = await createRemote(f, "alpha");
    await commit(f, work, ssh(f), "v1");
    await writeConf(f, [entry("alpha")]);
    const real = join(f.root, "real-signers");
    await writeFile(real, await readFile(join(f.trust, "allowed_signers"), "utf8"));
    await chmod(real, 0o600);
    await rm(join(f.trust, "allowed_signers"));
    await symlink(real, join(f.trust, "allowed_signers"));

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("trust material missing");
    expect(existsSync(checkout(f, "alpha"))).toBe(false);
  }, TIMEOUT);

  test("a missing OpenPGP verifier fails only the OpenPGP-signed tool", async () => {
    const f = await fixture({ openpgp: true });
    const alpha = await createRemote(f, "alpha");
    await commit(f, alpha, ssh(f), "v1");
    const beta = await createRemote(f, "beta");
    await commit(f, beta, { format: "openpgp", key: f.keys.gpg! }, "v1");
    await writeConf(f, [entry("alpha"), entry("beta")]);
    await rm(join(f.root, "tools/verify-gpg.sh"));

    const run = await sync(f);

    expect(run.code).toBe(1);
    expect(run.out).toContain("alpha: cloned, built, linked alpha");
    expect(run.out).toContain("beta: failed: ");
    expect(run.out).toContain("verify-gpg.sh is missing");
    expect(existsSync(checkout(f, "beta"))).toBe(false);
  }, TIMEOUT);
});
