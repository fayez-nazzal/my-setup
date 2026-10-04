import { constants } from "node:fs";
import { access, appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { onePasswordAgentSocket, opSshSignPath } from "./apps";
import { prompt } from "./commands";
import { ensureGpgSigningKey, ensureGpgTooling, exportPublicKey, gpgItems } from "./gpg";
import { ensureOpSession, findItem, readField } from "./onepassword";
import type { RecipeContext, ToolResult } from "./tools";

/** 1Password item titles; no secret value lives in this repository. */
export const signingItems = { sshKey: "SSH Key", passphrase: gpgItems.passphrase, gpgSecretKey: gpgItems.secretKey } as const;
export const signingKeyPath = (home: string) => join(home, ".ssh/id_1password_signing");
export const allowedSignersPath = (home: string) => join(home, ".config/git/allowed_signers");

const result = (id: string, status: ToolResult["status"], ...attention: string[]): ToolResult => ({ id, status, attention });
const exists = (path: string) => access(path).then(() => true, () => false);
const executable = (path: string) => access(path, constants.X_OK).then(() => true, () => false);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
/** `type base64` without the comment: the identity GitHub and allowed_signers compare. */
export const keyIdentity = (publicKey: string) => publicKey.trim().split(/\s+/).slice(0, 2).join(" ");

/** gh authenticates GitHub HTTPS pushes independently of whether an SSH signing key is also an authentication key. */
export async function ensureGhAuth(c: RecipeContext): Promise<ToolResult> {
  const gh = c.host.executables.get("gh");
  if (!gh) return result("gh-auth", "blocked", "GitHub CLI (gh) is not installed; select GitHub CLI and rerun.");
  if ((await c.run(gh, ["auth", "status", "--hostname", "github.com"], { quiet: true, stdin: "ignore" })).code === 0) return result("gh-auth", "unchanged");
  const protocol = "https";
  // gh writes its credential helper with `git config --global`; point that at ~/.gitconfig.local instead of the tracked file.
  const git = c.host.executables.get("git");
  const target = git ? await gitConfigTarget(c, git) : [];
  const env: Record<string, string> = target[0] === "--file" ? { GIT_CONFIG_GLOBAL: target[1]! } : {};
  console.log("Signing in to GitHub CLI. gh shows a one-time code; enter it at https://github.com/login/device in any browser (a server can use your laptop's).");
  const login = await c.run(gh, ["auth", "login", "--hostname", "github.com", "--git-protocol", protocol, "--web", "--skip-ssh-key", "--scopes", "admin:ssh_signing_key,write:gpg_key"], { inherit: ["stdout", "stderr"], env });
  if (login.code !== 0) return result("gh-auth", "failed", "gh auth login did not complete; rerun the installer or run gh auth login.");
  if ((await c.run(gh, ["auth", "setup-git", "--hostname", "github.com"], { quiet: true, env })).code !== 0) return result("gh-auth", "failed", "gh auth setup-git failed; git HTTPS pushes will not use the gh token.");
  if ((await c.run(gh, ["auth", "status", "--hostname", "github.com"], { quiet: true, stdin: "ignore" })).code !== 0) return result("gh-auth", "failed", "gh auth status still fails after sign-in.");
  return result("gh-auth", "changed");
}

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

async function gitGet(c: RecipeContext, git: string, scope: readonly string[], key: string): Promise<string | undefined> {
  const value = await c.run(git, ["config", ...scope, "--get", key], { quiet: true, stdin: "ignore" });
  return value.code === 0 ? value.stdout.trim() : undefined;
}

/** Write each differing value (undefined removes it); returns the keys that changed. */
async function setGitValues(c: RecipeContext, git: string, target: readonly string[], desired: ReadonlyMap<string, string | undefined>): Promise<string[]> {
  const changed: string[] = [];
  for (const [key, value] of desired) {
    const current = await gitGet(c, git, target, key);
    if (current === value) continue;
    const written = value === undefined ? await c.run(git, ["config", ...target, "--unset-all", key], { quiet: true }) : await c.run(git, ["config", ...target, key, value], { quiet: true });
    if (written.code !== 0) throw new Error(`git config ${target.join(" ")} ${key} failed: ${written.stderr.trim()}`);
    changed.push(key);
  }
  return changed;
}

/** Keep the user's IdentityAgent if any; otherwise route ssh through the 1Password agent. */
async function ensureAgentConfig(c: RecipeContext): Promise<{ changed: boolean; attention: string[] }> {
  const socket = onePasswordAgentSocket(c.host.platform, c.home);
  const attention = await exists(socket) ? [] : ["1Password's SSH agent socket is missing; in 1Password open Settings → Developer and turn on “Use the SSH agent”."];
  const config = join(c.home, ".ssh/config");
  const current = await readFile(config, "utf8").catch(() => "");
  if (/^\s*IdentityAgent\b/im.test(current)) return { changed: false, attention };
  const agent = c.host.platform === "darwin" ? "\"~/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock\"" : "~/.1password/agent.sock";
  await mkdir(dirname(config), { recursive: true, mode: 0o700 });
  await appendFile(config, `${current && !current.endsWith("\n") ? "\n" : ""}# 1Password SSH agent (my-setup installer)\nHost *\n\tIdentityAgent ${agent}\n`, { mode: 0o600 });
  return { changed: true, attention };
}

/** Ensure one `email namespaces="git" key` line so `git verify-commit` and `git log --show-signature` trust the key. */
async function ensureAllowedSigner(c: RecipeContext, email: string, identity: string): Promise<boolean> {
  const path = allowedSignersPath(c.home);
  const current = await readFile(path, "utf8").catch(() => "");
  if (current.split("\n").some(line => !line.trimStart().startsWith("#") && line.split(/\s+/)[0] === email && line.includes(identity) && (!line.includes("namespaces=") || /namespaces="(?:[^"]*,)?(?:git|\*)(?:,[^"]*)?"/.test(line)))) return false;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${current && !current.endsWith("\n") ? "\n" : ""}${email} namespaces="git" ${identity}\n`);
  return true;
}

/** Askpass environment that hands `ssh-keygen` the passphrase through the environment, never argv or a prompt. */
async function askpassEnvironment(directory: string, passphrase: string): Promise<Record<string, string>> {
  const script = join(directory, "askpass");
  await writeFile(script, "#!/bin/sh\nprintf '%s\\n' \"$MY_SETUP_SIGNING_PASSPHRASE\"\n", { mode: 0o700 });
  return { SSH_ASKPASS: script, SSH_ASKPASS_REQUIRE: "force", MY_SETUP_SIGNING_PASSPHRASE: passphrase };
}

/**
 * Machines without the 1Password app keep a copy of “SSH Key” encrypted with “GPG Key Password”.
 * An existing file is kept when it is encrypted, decrypts with that passphrase, and matches the key.
 */
async function ensureEncryptedSigningKey(c: RecipeContext, keygen: string, identity: string, readPrivateKey: () => Promise<string>, env: Record<string, string>): Promise<boolean> {
  const path = signingKeyPath(c.home);
  const derived = async (file: string) => {
    const output = await c.run(keygen, ["-y", "-f", file], { quiet: true, stdin: "ignore", env });
    return output.code === 0 ? keyIdentity(output.stdout) : undefined;
  };
  const encrypted = async (file: string) => (await c.run(keygen, ["-y", "-P", "", "-f", file], { quiet: true, stdin: "ignore" })).code !== 0;
  const publicFile = await readFile(`${path}.pub`, "utf8").catch(() => "");
  if (await exists(path) && keyIdentity(publicFile) === identity && await encrypted(path) && await derived(path) === identity) return false;
  // Stage beside the destination: the plaintext key never reaches /tmp, and the final rename stays on one filesystem.
  const stage = await mkdtemp(join(dirname(path), ".my-setup-signing-"));
  try {
    const staged = join(stage, "key");
    const privateKey = await readPrivateKey();
    await writeFile(staged, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, { mode: 0o600, flag: "wx" });
    if ((await c.run(keygen, ["-p", "-f", staged], { quiet: true, stdin: "ignore", env })).code !== 0) throw new Error("ssh-keygen could not encrypt the signing key with the “GPG Key Password” passphrase.");
    if (!await encrypted(staged) || await derived(staged) !== identity) throw new Error("The encrypted signing key does not match the 1Password “SSH Key” public key.");
    for (const file of [path, `${path}.pub`]) if (await exists(file)) {
      if (!c.backupUserFile) throw new Error(`Cannot replace ${file}; user-file backup support is unavailable.`);
      await c.backupUserFile(file);
    }
    await rename(staged, path);
    await writeFile(`${path}.pub`, `${identity} 1Password SSH Key\n`, { mode: 0o644 });
    return true;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

interface GithubKey { kind: string; scope: string; list: readonly string[]; registered(lines: readonly string[]): boolean; add(file: string): readonly string[]; write(file: string): Promise<void>; manual: string }

/** Register a signing key on GitHub through gh; asks gh for the key type's scope only when listing fails. */
async function ensureGithubKey(c: RecipeContext, key: GithubKey, workspace: string): Promise<{ changed: boolean; attention: string[] }> {
  const manual = [`${key.manual}, or select GitHub CLI sign-in, so GitHub marks commits Verified.`];
  const gh = c.host.executables.get("gh");
  if (!gh || (await c.run(gh, ["auth", "status", "--hostname", "github.com"], { quiet: true, stdin: "ignore" })).code !== 0) return { changed: false, attention: manual };
  const list = () => c.run(gh, ["api", "--paginate", ...key.list], { quiet: true, stdin: "ignore" });
  let listed = await list();
  if (listed.code !== 0) {
    console.log(`GitHub CLI needs the ${key.scope} scope to register your ${key.kind}.`);
    await c.run(gh, ["auth", "refresh", "--hostname", "github.com", "--scopes", key.scope], { inherit: ["stdout", "stderr"] });
    listed = await list();
    if (listed.code !== 0) return { changed: false, attention: manual };
  }
  if (key.registered(listed.stdout.split("\n").map(line => line.trim()).filter(Boolean))) return { changed: false, attention: [] };
  const file = join(workspace, "github-key");
  await key.write(file);
  const added = await c.run(gh, key.add(file), { quiet: true });
  if (added.code !== 0) return { changed: false, attention: [`Registering the ${key.kind} on GitHub failed (${added.stderr.trim()}).`, ...manual] };
  console.log(`git-signing: registered the ${key.kind} on GitHub`);
  return { changed: true, attention: [] };
}

/** Prove the proposed signing configuration before enabling it globally. */
async function verifySigning(c: RecipeContext, git: string, workspace: string, env: Record<string, string>, desired: ReadonlyMap<string, string | undefined>): Promise<string | undefined> {
  const overrides = [...desired].flatMap(([key, value]) => ["-c", `${key}=${value ?? (key === "gpg.ssh.program" ? "ssh-keygen" : "")}`]);
  const repository = join(workspace, "check");
  if ((await c.run(git, ["init", "-q", repository], { quiet: true })).code !== 0) return "git init failed for the signing check.";
  const commit = await c.run(git, [...overrides, "-C", repository, "-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "--no-verify", "-q", "-m", "my-setup signing check"], { quiet: true, env });
  if (commit.code !== 0) return `Signing a test commit failed: ${commit.stderr.trim().split("\n").at(-1) ?? `exit ${commit.code}`}`;
  const verified = await c.run(git, [...overrides, "-C", repository, "verify-commit", "HEAD"], { quiet: true, env });
  return verified.code === 0 ? undefined : `The test commit signature did not verify: ${verified.stderr.trim().split("\n").at(-1) ?? ""}`;
}

export type SigningMethod = "openpgp" | "ssh";
/** The method this machine already uses: gpg.format, or a fingerprint-shaped user.signingkey without one. */
export async function currentSigningMethod(c: RecipeContext, git: string): Promise<SigningMethod | undefined> {
  const format = await gitGet(c, git, ["--global", "--includes"], "gpg.format");
  if (format === "ssh" || format === "openpgp") return format;
  return /^(0x)?[0-9A-Fa-f]{16,40}$/.test(await gitGet(c, git, ["--global", "--includes"], "user.signingkey") ?? "") ? "openpgp" : undefined;
}

interface MethodSetup { desired: Map<string, string | undefined>; github: GithubKey; env: Record<string, string>; changed: boolean; attention: string[]; afterConfig?: () => Promise<boolean>; notice?: string }

/** OpenPGP: gpg + pinentry, the key from this keyring or 1Password, and its public half on GitHub. */
async function openpgpSetup(c: RecipeContext, git: string, op: string, identity: { name: string; email: string }, workspace: string): Promise<MethodSetup> {
  const tooling = await ensureGpgTooling(c);
  const key = await ensureGpgSigningKey(c, tooling.gpg, op, identity, await gitGet(c, git, ["--global", "--includes"], "user.signingkey"), workspace);
  const tty = await c.run("tty", [], { quiet: true });
  return {
    desired: new Map<string, string | undefined>([["gpg.format", "openpgp"], ["user.signingkey", key.fingerprint], ["gpg.ssh.program", undefined], ["commit.gpgsign", "true"]]),
    github: {
      kind: "GPG key", scope: "write:gpg_key", list: ["user/gpg_keys", "--jq", ".[].key_id"],
      registered: lines => lines.some(line => line.toUpperCase() === key.fingerprint.slice(-16)),
      add: file => ["gpg-key", "add", file, "--title", `${identity.name} (${key.fingerprint.slice(-16)})`],
      write: file => exportPublicKey(c, tooling.gpg, key.fingerprint, file),
      manual: `Add GPG key ${key.fingerprint} (gpg --armor --export ${key.fingerprint.slice(-16)}) at https://github.com/settings/gpg/new`,
    },
    // pinentry needs the terminal when the agent has not cached the passphrase.
    env: tty.code === 0 ? { GPG_TTY: tty.stdout.trim() } : {},
    changed: tooling.changed || key.changed, attention: key.attention,
  };
}

/** SSH: the 1Password “SSH Key” through op-ssh-sign, or a “GPG Key Password”-encrypted copy where the app is absent. */
async function sshSetup(c: RecipeContext, op: string, email: string, workspace: string): Promise<MethodSetup> {
  const keygen = c.host.executables.get("ssh-keygen");
  if (!keygen) throw new Error("ssh-keygen (OpenSSH) is required for SSH commit signing.");
  const sshItem = await findItem(c, op, signingItems.sshKey, "SSH Key");
  const identity = keyIdentity(await readField(c, op, sshItem, "public key"));
  if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-\S+) [A-Za-z0-9+/=]+$/.test(identity)) throw new Error(`The “${signingItems.sshKey}” public key field is not an OpenSSH public key.`);
  const appSigner = opSshSignPath(c.host.platform);
  const useApp = await executable(appSigner);
  const setup: MethodSetup = {
    desired: new Map<string, string | undefined>([["gpg.format", "ssh"], ["user.signingkey", useApp ? identity : signingKeyPath(c.home)], ["gpg.ssh.program", useApp ? appSigner : undefined], ["gpg.ssh.allowedSignersFile", allowedSignersPath(c.home)], ["commit.gpgsign", "true"]]),
    github: {
      kind: "SSH signing key", scope: "admin:ssh_signing_key", list: ["user/ssh_signing_keys", "--jq", ".[].key"],
      registered: lines => lines.some(line => keyIdentity(line) === identity),
      add: file => ["ssh-key", "add", file, "--type", "signing", "--title", `1Password ${signingItems.sshKey}`],
      write: file => writeFile(file, `${identity}\n`),
      manual: `Add the public key of 1Password “${signingItems.sshKey}” (${identity.slice(0, 32)}…) as a Signing Key at https://github.com/settings/ssh/new`,
    },
    env: {}, changed: false, attention: [],
    afterConfig: () => ensureAllowedSigner(c, email, identity),
    ...(useApp ? { notice: "Signing a test commit; approve the 1Password prompt if it appears…" } : {}),
  };
  if (useApp) {
    const agent = await ensureAgentConfig(c);
    setup.changed = agent.changed; setup.attention.push(...agent.attention);
    return setup;
  }
  const passphraseItem = await findItem(c, op, signingItems.passphrase);
  setup.env = await askpassEnvironment(workspace, await readField(c, op, passphraseItem, "password"));
  await mkdir(join(c.home, ".ssh"), { recursive: true, mode: 0o700 });
  if (await ensureEncryptedSigningKey(c, keygen, identity, () => readField(c, op, sshItem, "private key", "?ssh-format=openssh"), setup.env)) {
    setup.changed = true;
    setup.attention.push(`No 1Password app here, so commits sign with ${signingKeyPath(c.home)}, encrypted with “${signingItems.passphrase}”. git asks for that passphrase per commit unless your ssh-agent holds the key (ssh-add ${signingKeyPath(c.home)}, or ssh -A from a 1Password machine).`);
  }
  return setup;
}

/**
 * Commit signing from 1Password. Keeps the method this machine already uses (gpg.format), otherwise asks:
 * OpenPGP with the GPG key (passphrase “GPG Key Password”, secret key backed up as “GPG Secret Key”), or SSH with
 * the “SSH Key” item. Then writes the git settings outside the tracked file, registers the key on GitHub, and
 * signs and verifies a throwaway commit. Installs and signs in to the 1Password CLI first when needed.
 */
export async function configureGitSigning(c: RecipeContext): Promise<ToolResult> {
  const git = c.host.executables.get("git");
  if (!git) return result("git-signing", "blocked", "git is not installed.");
  const session = await ensureOpSession(c);
  if (!session.ok) return result("git-signing", "blocked", session.reason);
  const workspace = await mkdtemp(join(tmpdir(), "my-setup-signing-"));
  try {
    const target = await gitConfigTarget(c, git);
    const attention: string[] = [];
    let changed = false;
    for (const [key, question] of [["user.name", "Git author name: "], ["user.email", "Git commit email (a verified address on your GitHub account): "]] as const) {
      if (await gitGet(c, git, ["--global", "--includes"], key)) continue;
      const answer = await prompt(question);
      if (!answer) return result("git-signing", "blocked", `${key} is not set; set it in ~/.gitconfig.local and rerun.`);
      changed = (await setGitValues(c, git, target, new Map([[key, answer]]))).length > 0 || changed;
    }
    const name = (await gitGet(c, git, ["--global", "--includes"], "user.name"))!;
    const email = (await gitGet(c, git, ["--global", "--includes"], "user.email"))!;
    const method = await currentSigningMethod(c, git) ?? (/^2/.test(await prompt(`Sign commits with 1) your GPG key (1Password “${signingItems.passphrase}”) or 2) your 1Password “${signingItems.sshKey}”? [1] `)) ? "ssh" : "openpgp");
    const setup = method === "openpgp" ? await openpgpSetup(c, git, session.op, { name, email }, workspace) : await sshSetup(c, session.op, email, workspace);
    changed ||= setup.changed; attention.push(...setup.attention);
    if (setup.afterConfig) changed = await setup.afterConfig() || changed;
    if (setup.notice) console.log(setup.notice);
    const failure = await verifySigning(c, git, workspace, setup.env, setup.desired);
    if (failure) return result("git-signing", "failed", failure, ...attention);
    const written = await setGitValues(c, git, target, setup.desired);
    if (written.length) { changed = true; console.log(`git-signing: set ${written.join(", ")} in ${target.at(-1)}`); }
    if (target[0] === "--file") await chmod(target[1]!, 0o600);
    // A value later in ~/.gitconfig (for example one `git config --global` wrote through the tracked symlink) overrides the include.
    for (const [key, value] of setup.desired) {
      if (await gitGet(c, git, ["--global", "--includes"], key) === value) continue;
      const origin = await c.run(git, ["config", "--global", "--includes", "--show-origin", "--get", key], { quiet: true, stdin: "ignore" });
      return result("git-signing", "failed", `${key} is overridden by ${origin.stdout.trim().split("\t")[0] || "another config file"}; remove it there so the ${target.at(-1)} value applies.`);
    }
    const github = await ensureGithubKey(c, setup.github, workspace);
    changed ||= github.changed; attention.push(...github.attention);
    return result("git-signing", changed ? "changed" : "unchanged", ...attention);
  } catch (error) {
    return result("git-signing", "failed", message(error));
  } finally { await rm(workspace, { recursive: true, force: true }); }
}
