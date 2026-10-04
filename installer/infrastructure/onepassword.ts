import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { appSudoRoutes, inspectApp, installApp, onePasswordAppBinary } from "./apps";
import { ensureSudo, prompt } from "./commands";
import type { PackageContext } from "./packages";

export type OpSession = { ok: true; op: string; changed: boolean } | { ok: false; reason: string };
export interface OpItem { id: string; vault: string; vaultName: string }

/** One sign-in per installer run; later components reuse it (password sign-ins export OP_SESSION_* into this process). */
let session: Promise<OpSession> | undefined;
export function ensureOpSession(c: PackageContext): Promise<OpSession> {
  session ??= establish(c);
  return session;
}

/** Parsed JSON array, or an empty array when the output is not one. */
function jsonArray(text: string): unknown[] {
  try { const value: unknown = JSON.parse(text); return Array.isArray(value) ? value : []; } catch { return []; }
}
function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? Reflect.get(value, key) : undefined;
}
const text = (value: unknown) => typeof value === "string" ? value : undefined;

/** `op signin` prints `export OP_SESSION_<id>="<token>"` lines for `eval`; return each name/token pair. */
export function parseSessionExports(output: string): Array<[string, string]> {
  return [...output.matchAll(/^export (OP_SESSION_\w+)="([^"]+)"/gm)].map(match => [match[1]!, match[2]!]);
}

async function establish(c: PackageContext): Promise<OpSession> {
  if (!c.host.executables.get("op")) {
    console.log("1Password CLI (op) is missing; installing it first.");
    if (appSudoRoutes.has((await inspectApp(c, "1password-cli")).route ?? "") && !await ensureSudo()) return { ok: false, reason: "Installing the 1Password CLI needs sudo, which was declined or unavailable." };
    const installed = await installApp(c, "1password-cli");
    if (installed.code !== 0) return { ok: false, reason: `Installing the 1Password CLI failed: ${installed.stderr.trim()}` };
    await c.refreshHost?.();
  }
  const op = c.host.executables.get("op");
  if (!op) return { ok: false, reason: "The 1Password CLI was installed but op is still not on PATH." };
  // stdin is detached so op can never wait on an invisible prompt; desktop-app integration still authorizes through the app.
  const authenticated = async () => (await c.run(op, ["vault", "list", "--format", "json"], { quiet: true, stdin: "ignore" })).code === 0;
  const accounts = async () => jsonArray((await c.run(op, ["account", "list", "--format", "json"], { quiet: true, stdin: "ignore" })).stdout);
  if (await authenticated()) return { ok: true, op, changed: false };
  const appInstalled = await access(onePasswordAppBinary(c.host.platform), constants.X_OK).then(() => true, () => false);
  if (!(await accounts()).length && appInstalled) {
    console.log("The 1Password CLI has no account yet. In the 1Password app, open Settings → Developer and turn on “Integrate with 1Password CLI” (and “Use the SSH agent”).");
    const answer = await prompt("Press Enter once it is on, or type “manual” to add the account with your Secret Key instead: ");
    if (answer.toLowerCase() !== "manual" && await authenticated()) return { ok: true, op, changed: true };
  }
  if (!(await accounts()).length) {
    console.log("Adding your 1Password account to op. It asks for your sign-in address (for example my.1password.com), email, Secret Key, and password; op keeps them in ~/.config/op, never in this repository.");
    const added = await c.run(op, ["account", "add"], { inherit: ["stdout", "stderr"] });
    if (added.code !== 0) return { ok: false, reason: "op account add did not complete; rerun the installer or run op account add yourself." };
  }
  if (await authenticated()) return { ok: true, op, changed: true };
  // Password sign-in: the prompt stays on the terminal; the session token arrives on stdout and only enters this process's environment.
  console.log("Signing in to 1Password CLI…");
  const signin = await c.run(op, ["signin"], { quiet: true, inherit: ["stderr"] });
  if (signin.code !== 0) return { ok: false, reason: "op signin failed; check the account password and rerun." };
  for (const [name, token] of parseSessionExports(signin.stdout)) process.env[name] = token;
  return await authenticated() ? { ok: true, op, changed: true } : { ok: false, reason: "op signin succeeded but op still cannot list vaults." };
}

/** Every item with this exact title across the vaults op can see; the listing carries no field values. */
async function itemsTitled(c: PackageContext, op: string, title: string, category?: string): Promise<OpItem[]> {
  const listed = await c.run(op, ["item", "list", "--format", "json", ...(category ? ["--categories", category] : [])], { quiet: true, stdin: "ignore" });
  if (listed.code !== 0) throw new Error(`op item list failed: ${listed.stderr.trim()}`);
  return jsonArray(listed.stdout).flatMap(item => {
    const id = text(field(item, "id")), vault = text(field(field(item, "vault"), "id"));
    return text(field(item, "title")) === title && id && vault ? [{ id, vault, vaultName: text(field(field(item, "vault"), "name")) ?? vault }] : [];
  });
}

/** Locate an item by exact title; asks which one when several vaults hold it. Undefined when none exists. */
export async function findOptionalItem(c: PackageContext, op: string, title: string, category?: string): Promise<OpItem | undefined> {
  const matches = await itemsTitled(c, op, title, category);
  if (matches.length <= 1) return matches[0];
  console.log(`Several 1Password items are titled “${title}”:`);
  matches.forEach((item, index) => console.log(`  ${index + 1}) vault ${item.vaultName} (item ${item.id})`));
  const chosen = matches[Number(await prompt(`Which one should be used? [1-${matches.length}] `)) - 1];
  if (!chosen) throw new Error(`No item chosen for “${title}”.`);
  return chosen;
}

export async function findItem(c: PackageContext, op: string, title: string, category?: string): Promise<OpItem> {
  const item = await findOptionalItem(c, op, title, category);
  if (!item) throw new Error(`No 1Password item titled “${title}”${category ? ` of type ${category}` : ""} is visible to op.`);
  return item;
}

/** Save a Document item's file to `destination` (mode 0600) without passing its contents through this process. */
export async function saveDocument(c: PackageContext, op: string, item: OpItem, destination: string): Promise<void> {
  const saved = await c.run(op, ["document", "get", item.id, "--vault", item.vault, "--out-file", destination, "--file-mode", "0600"], { quiet: true, stdin: "ignore" });
  if (saved.code !== 0) throw new Error(`Could not download 1Password document ${item.id}: ${saved.stderr.trim()}`);
}

/** Store a local file as a new Document item in `vault`. */
export async function createDocument(c: PackageContext, op: string, file: string, title: string, fileName: string, vault: string): Promise<void> {
  const created = await c.run(op, ["document", "create", file, "--title", title, "--file-name", fileName, "--vault", vault], { quiet: true, stdin: "ignore" });
  if (created.code !== 0) throw new Error(`Could not store “${title}” in 1Password: ${created.stderr.trim()}`);
}

/** Read one field through a secret reference; the value is returned to the caller only, never printed. */
export async function readField(c: PackageContext, op: string, item: OpItem, fieldName: string, query = ""): Promise<string> {
  const result = await c.run(op, ["read", "--no-newline", `op://${item.vault}/${item.id}/${fieldName}${query}`], { quiet: true, stdin: "ignore" });
  if (result.code !== 0 || !result.stdout) throw new Error(`Could not read the “${fieldName}” field of 1Password item ${item.id}: ${result.stderr.trim()}`);
  return result.stdout;
}
