import { constants } from "node:fs";
import { access, appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { executableOnPath } from "./host";
import { ensureSudo, prompt } from "./commands";
import { brewPackageCommand, installApt } from "./packages";
import type { RecipeContext } from "./packages";
import { createDocument, findOptionalItem, readField, saveDocument } from "./onepassword";

/** 1Password items: the key's passphrase (Login, `password` field) and the passphrase-protected secret key (Document). */
export const gpgItems = { passphrase: "GPG Key Password", secretKey: "GPG Secret Key" } as const;

const exists = (path: string) => access(path, constants.X_OK).then(() => true, () => false);
const yes = async (question: string) => !/^n/i.test(await prompt(`${question} [Y/n] `));

/**
 * gpg plus a pinentry: on macOS Homebrew's gnupg and pinentry-mac, with gpg-agent.conf pointing at it when it names
 * no pinentry yet; on Linux APT's gnupg and pinentry-curses. Returns the gpg path.
 */
export async function ensureGpgTooling(c: RecipeContext): Promise<{ gpg: string; changed: boolean }> {
  let changed = false;
  if (c.host.platform === "darwin") {
    const brew = c.host.packageManagers.brew;
    const pinentry = brew ? join(dirname(dirname(brew)), "bin/pinentry-mac") : undefined;
    const missing = [!c.host.executables.get("gpg") && "gnupg", pinentry && !await exists(pinentry) && "pinentry-mac"].filter(Boolean).join(" ");
    if (missing) {
      if (!brew) throw new Error("GPG signing on macOS needs Homebrew's gnupg and pinentry-mac; rerun install.sh and accept the Homebrew bootstrap.");
      const installed = await brewPackageCommand(c, "install", missing);
      if (installed.code !== 0) throw new Error(`brew install ${missing} failed.`);
      await c.refreshHost?.(); changed = true;
    }
    const conf = join(c.home, ".gnupg/gpg-agent.conf");
    await mkdir(dirname(conf), { recursive: true, mode: 0o700 }); await chmod(dirname(conf), 0o700);
    const current = await readFile(conf, "utf8").catch(() => "");
    if (pinentry && !/^\s*pinentry-program\s/m.test(current)) {
      await appendFile(conf, `${current && !current.endsWith("\n") ? "\n" : ""}pinentry-program ${pinentry}\n`);
      const gpgconf = join(dirname(c.host.executables.get("gpg")!), "gpgconf");
      await c.run(gpgconf, ["--kill", "gpg-agent"], { quiet: true });
      changed = true;
    }
  } else {
    const pinentry = await executableOnPath("pinentry");
    const missing = [!c.host.executables.get("gpg") && "gnupg", !pinentry && "pinentry-curses"].filter(Boolean).join(" ");
    if (missing) {
      if (!c.host.packageManagers.apt) throw new Error(`GPG signing needs ${missing}; install it with your package manager and rerun.`);
      if (!await ensureSudo()) throw new Error(`Installing ${missing} needs sudo, which was declined or unavailable.`);
      const installed = await installApt(c, missing);
      if (installed.code !== 0) throw new Error(`apt-get install ${missing} failed.`);
      await c.refreshHost?.(); changed = true;
    }
  }
  const gpg = c.host.executables.get("gpg");
  if (!gpg) throw new Error("gpg is still unavailable.");
  return { gpg, changed };
}

interface SecretKey { fingerprint: string; emails: string[] }
/** Usable (not expired/revoked/disabled) signing-capable secret keys, from `--with-colons` output. */
export function parseSecretKeys(colons: string): SecretKey[] {
  const keys: SecretKey[] = [];
  let current: (SecretKey & { usable: boolean; fingerprintSeen: boolean }) | undefined;
  for (const line of colons.split("\n")) {
    const fields = line.split(":");
    if (fields[0] === "sec") {
      if (current?.usable) keys.push({ fingerprint: current.fingerprint, emails: current.emails });
      current = { fingerprint: "", emails: [], usable: !["e", "r", "d", "i"].includes(fields[1] ?? "") && (fields[11] ?? "").includes("S"), fingerprintSeen: false };
    } else if (fields[0] === "fpr" && current && !current.fingerprintSeen) { current.fingerprint = fields[9] ?? ""; current.fingerprintSeen = true; }
    else if (fields[0] === "uid" && current) { const email = /<([^>]+)>/.exec(fields[9] ?? "")?.[1]; if (email) current.emails.push(email.toLowerCase()); }
    else if (fields[0] === "ssb" && current) current.fingerprintSeen = true;
  }
  if (current?.usable) keys.push({ fingerprint: current.fingerprint, emails: current.emails });
  return keys.filter(key => /^[0-9A-F]{40}$/.test(key.fingerprint));
}

export interface GpgKeyOutcome { fingerprint: string; changed: boolean; attention: string[] }

/**
 * Pick the signing key, in order: the configured user.signingkey when this keyring holds it; the 1Password
 * “GPG Secret Key” backup (imported when missing here); a local key for the commit email; or, after asking,
 * a new ed25519 signing key valid for two years. The “GPG Key Password” passphrase must unlock it, and a key
 * that 1Password does not hold yet is offered for backup so other machines can import it.
 */
export async function ensureGpgSigningKey(c: RecipeContext, gpg: string, op: string, identity: { name: string; email: string }, configured: string | undefined, workspace: string): Promise<GpgKeyOutcome> {
  const attention: string[] = [];
  let changed = false;
  const passphraseItem = await findOptionalItem(c, op, gpgItems.passphrase);
  if (!passphraseItem) throw new Error(`Create a 1Password Login item “${gpgItems.passphrase}” whose password is your GPG key passphrase, then rerun.`);
  const passphraseFile = join(workspace, "gpg-passphrase");
  await writeFile(passphraseFile, await readField(c, op, passphraseItem, "password"), { mode: 0o600 });
  const loopback = ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-file", passphraseFile];
  const listLocal = async () => parseSecretKeys((await c.run(gpg, ["--batch", "--with-colons", "--list-secret-keys"], { quiet: true, stdin: "ignore" })).stdout);
  let local = await listLocal();
  const backupItem = await findOptionalItem(c, op, gpgItems.secretKey, "Document");
  const backupFile = join(workspace, "gpg-secret-key.asc");
  let backupFingerprint: string | undefined;
  if (backupItem) {
    await saveDocument(c, op, backupItem, backupFile);
    backupFingerprint = (await c.run(gpg, ["--batch", "--with-colons", "--show-keys", backupFile], { quiet: true, stdin: "ignore" })).stdout.split("\n").find(line => line.startsWith("fpr:"))?.split(":")[9];
  }
  const configuredKey = configured ? local.find(key => key.fingerprint === configured.toUpperCase() || key.fingerprint.endsWith(configured.toUpperCase())) : undefined;
  let fingerprint = configuredKey?.fingerprint;
  if (!fingerprint && backupFingerprint) {
    if (!local.some(key => key.fingerprint === backupFingerprint)) {
      if ((await c.run(gpg, [...loopback, "--import", backupFile], { quiet: true, stdin: "ignore" })).code !== 0) throw new Error(`Importing 1Password “${gpgItems.secretKey}” failed; check that “${gpgItems.passphrase}” unlocks it.`);
      const trust = join(workspace, "ownertrust");
      await writeFile(trust, `${backupFingerprint}:6:\n`);
      await c.run(gpg, ["--batch", "--import-ownertrust", trust], { quiet: true, stdin: "ignore" });
      console.log(`git-signing: imported GPG key ${backupFingerprint} from 1Password`);
      changed = true;
    }
    fingerprint = backupFingerprint;
  }
  fingerprint ??= local.filter(key => key.emails.includes(identity.email.toLowerCase())).at(-1)?.fingerprint;
  if (!fingerprint) {
    if (!await yes(`No GPG signing key for ${identity.name} <${identity.email}> here or in 1Password “${gpgItems.secretKey}”. Create one (ed25519, signing only, expires in 2 years) protected by “${gpgItems.passphrase}”?`)) throw new Error("No GPG signing key is available.");
    if ((await c.run(gpg, [...loopback, "--quick-generate-key", `${identity.name} <${identity.email}>`, "ed25519", "sign", "2y"], { quiet: true, stdin: "ignore" })).code !== 0) throw new Error("gpg could not create the signing key.");
    local = await listLocal();
    fingerprint = local.filter(key => key.emails.includes(identity.email.toLowerCase())).at(-1)?.fingerprint;
    if (!fingerprint) throw new Error("The new GPG key is missing from the keyring.");
    console.log(`git-signing: created GPG key ${fingerprint}`);
    changed = true;
  }
  // Proves the 1Password passphrase unlocks the key, and leaves it cached in gpg-agent for the verification commit.
  const probe = join(workspace, "probe");
  await writeFile(probe, "my-setup signing probe\n");
  if ((await c.run(gpg, [...loopback, "--local-user", fingerprint, "--detach-sign", "--output", `${probe}.sig`, probe], { quiet: true, stdin: "ignore" })).code !== 0) throw new Error(`The password of 1Password “${gpgItems.passphrase}” does not unlock GPG key ${fingerprint}. Either save the key's real passphrase in that item, or run gpg --passwd ${fingerprint} and set the item's password as the new passphrase; then rerun.`);
  if (!backupFingerprint) {
    if (await yes(`Store GPG key ${fingerprint.slice(-16)} (still protected by its passphrase) in 1Password as “${gpgItems.secretKey}” so your other machines can import it?`)) {
      const exported = join(workspace, "export.asc");
      if ((await c.run(gpg, [...loopback, "--armor", "--output", exported, "--export-secret-keys", fingerprint], { quiet: true, stdin: "ignore" })).code !== 0) throw new Error("gpg could not export the secret key for the 1Password backup.");
      await chmod(exported, 0o600);
      await createDocument(c, op, exported, gpgItems.secretKey, "gpg-secret-key.asc", passphraseItem.vault);
      console.log(`git-signing: stored GPG key ${fingerprint} in 1Password “${gpgItems.secretKey}”`);
      changed = true;
    } else attention.push(`GPG key ${fingerprint} exists only on this machine; rerun and accept the 1Password backup to sign on other machines.`);
  } else if (backupFingerprint !== fingerprint) attention.push(`1Password “${gpgItems.secretKey}” holds ${backupFingerprint}, but this machine signs with ${fingerprint}; other machines will import the 1Password key.`);
  return { fingerprint, changed, attention };
}

/** ASCII-armored public key for GitHub. */
export async function exportPublicKey(c: RecipeContext, gpg: string, fingerprint: string, file: string): Promise<void> {
  if ((await c.run(gpg, ["--batch", "--yes", "--armor", "--output", file, "--export", fingerprint], { quiet: true, stdin: "ignore" })).code !== 0) throw new Error(`gpg could not export public key ${fingerprint}.`);
}

