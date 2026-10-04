import { lstat } from "node:fs/promises";
import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { catalog, configurationLinks, configurationPrerequisites } from "./domain/catalog";
import { initialSelection, reduceSelection } from "./domain/selection";
import type { ComponentAvailability, ComponentId, ComponentResult } from "./domain/model";
import { UserFileLinks, assertOmpAgentDirectoryIsReal, migrateGitIdentity, migrateZshLocal, scanBackupForCredentials } from "./infrastructure/links";
import { inspectHost } from "./infrastructure/host";
import { inspectPackage, installRecipe } from "./infrastructure/packages";
import type { SoftwareState } from "./infrastructure/packages";
import { installAlacrittySource, installTmuxPlugins, installTmuxscope, installZshAbbr } from "./infrastructure/tools";
import { applyGnome, installKeyd, installKeydFromSource } from "./infrastructure/desktop";
import { commands } from "./infrastructure/commands";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) { console.error(`Unsupported argument: ${args.find((arg) => arg !== "--dry-run")}`); process.exit(2); }
const dryRun = args.includes("--dry-run");
if (typeof process.getuid === "function" && process.getuid() === 0) { console.error("Do not run the installer as root."); process.exit(1); }
if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error("Interactive installer requires a terminal on stdin and stdout."); process.exit(1); }
const root = resolve(import.meta.dir, "..");
const home = homedir();
let host;
try { host = await inspectHost(root); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
const fileLinks = new UserFileLinks({ home });
const recipeHost = { ...host, activeGnome: host.gnome.active, dbusAddress: host.gnome.dbusAddress, dconfAvailable: Boolean(host.gnome.dconf) };
const refreshHost = async () => {
  const updated = await inspectHost(root);
  recipeContext.host = { ...updated, activeGnome: updated.gnome.active, dbusAddress: updated.gnome.dbusAddress, dconfAvailable: Boolean(updated.gnome.dconf) };
};
const recipeContext = { host: recipeHost, home, repoRoot: root, run: commands.run.bind(commands), ensureLink: fileLinks.ensureLink.bind(fileLinks), backupUserFile: fileLinks.backup.bind(fileLinks), refreshHost };
const availability = new Map<ComponentId, ComponentAvailability>();
const softwareIds: ComponentId[] = ["zsh","git","tmux","starship","zoxide","fzf","bat","eza","fd","ripgrep","thefuck","volta","node-lts","alacritty","nerd-font","aerospace","linux-desktop","keyd"];
const softwareStates = new Map<ComponentId, SoftwareState>();
for (const id of softwareIds) {
  try { softwareStates.set(id, await inspectPackage(recipeContext, id)); }
  catch (error) { softwareStates.set(id, { installed:false, healthy:false, reason:error instanceof Error ? error.message : String(error) }); }
}
for (const item of catalog) {
  let enabled = item.platforms.includes(host.platform);
  let reason = enabled ? undefined : `Available only on ${item.platforms.join(" or ")}.`;
  let installed = false;
  const state = softwareStates.get(item.id);
  if (state) { installed = state.installed; if (!state.installed && !state.route) { enabled = false; reason = state.reason ?? "No supported installation route is available."; } }
  if (item.id === "zsh-abbr" || item.id === "tmuxscope" || item.id === "tmux-plugins") { enabled = item.platforms.includes(host.platform); }
  if (item.id === "gnome-apply") { enabled = host.platform === "linux" && host.gnome.active && Boolean(host.gnome.dbusAddress) && Boolean(host.gnome.dconf); if (!enabled) reason = "Active GNOME session, DBus address, and dconf are required."; }
  if (item.id === "keyd-config") enabled = host.platform === "linux";
  availability.set(item.id, { enabled, reason, installed });
}
for (const item of catalog) {
  const missing = item.requires.find((dependency) => !availability.get(dependency)?.installed && !availability.get(dependency)?.enabled);
  if (missing) availability.set(item.id, { ...availability.get(item.id)!, enabled: false, reason: `Requires ${missing}, which has no supported installation route.` });
}
const initial = initialSelection(catalog, availability);
let renderer;
try { renderer = await createCliRenderer({ exitOnCtrlC: false }); }
catch (error) { console.error(`OpenTUI setup failed; verify Bun and the pinned @opentui/core native package: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
const text = new TextRenderable(renderer, { content: "" });
const frame = new BoxRenderable(renderer, { id: "installer", flexDirection: "column", width: "100%", height: "100%", padding: 1, border: true, borderStyle: "rounded" });
frame.add(text); renderer.root.add(frame);
let state = initial;
const { promise, resolve: finish } = Promise.withResolvers<boolean>();
let done = false;
const draw = () => {
  const availableHeight = Math.max(0, (process.stdout.rows ?? 24) - 6);
  if (availableHeight < 3 || (process.stdout.columns ?? 80) < 40) { text.content = "Terminal too small. Resize the terminal to continue.\nEsc Cancel"; renderer.requestRender(); return; }
  const rows: string[] = [`Interactive installer · ${host.platform} · ${host.architecture}`, "Supported choices are selected by default", ""];
  const rendered: string[] = [];
  const componentRows: number[] = [];
  let group = "";
  catalog.forEach((item, index) => {
    if (item.group !== group) { group = item.group; rendered.push(`── ${group} ──`); }
    const option = availability.get(item.id)!;
    const marker = option.enabled && state.selected.has(item.id) ? "[x]" : "[ ]";
    componentRows[index] = rendered.length;
    rendered.push(`${index === state.cursor ? ">" : " "} ${marker} ${item.label}${option.enabled ? "" : ` (disabled: ${option.reason})`}${option.installed ? " (installed)" : ""}`);
  });
  const activeRow = componentRows[state.cursor] ?? 0;
  const start = Math.max(0, Math.min(rendered.length - availableHeight, activeRow - Math.floor(availableHeight / 2)));
  rows.push(...rendered.slice(start, start + availableHeight));
  rows.push("", catalog[state.cursor]?.description ?? "", "↑/↓ Move · Space Toggle · a Toggle all · Enter Install · Esc Cancel");
  text.content = rows.join("\n"); renderer.requestRender();
};
const onKey = (key: { name?: string; ctrl?: boolean }) => {
  if (done) return;
  if (key.ctrl && key.name === "c") { done = true; finish(false); return; }
  switch (key.name) {
    case "up": state = reduceSelection(state, "up", catalog, availability); break;
    case "down": state = reduceSelection(state, "down", catalog, availability); break;
    case "space": state = reduceSelection(state, "toggle", catalog, availability); break;
    case "a": state = reduceSelection(state, "toggle-all", catalog, availability); break;
    case "escape": done = true; finish(false); break;
    case "return": done = true; finish(true); break;
    default: return;
  }
  draw();
};
const cancelOnSignal = () => { if (!done) { done = true; finish(false); } };
process.once("SIGINT", cancelOnSignal);
process.once("SIGTERM", cancelOnSignal);
renderer.keyInput.on("keypress", onKey);
process.stdout.on("resize", draw);
const cleanup = async () => { renderer.keyInput.off("keypress", onKey); process.stdout.off("resize", draw); process.off("SIGINT", cancelOnSignal); process.off("SIGTERM", cancelOnSignal); await renderer.destroy(); };
try { draw(); } catch (error) { await cleanup(); console.error(`OpenTUI setup failed: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
const confirmed = await promise;
await cleanup();
if (!confirmed) process.exit(130);
if (!state.selected.size) { console.log("Nothing selected."); process.exit(0); }

const results: ComponentResult[] = [];
const attentionNotes: string[] = [];
const selectedSoftware = [...state.selected].filter((id) => softwareStates.has(id));
const needsSudo = (host.platform === "linux" && selectedSoftware.some((id) => ["apt", "apt-fontconfig"].includes(softwareStates.get(id)?.route ?? "") || (id === "keyd" && !softwareStates.get(id)?.installed))) || state.selected.has("keyd-config");
let sudoAvailable = true;
if (!dryRun && needsSudo) sudoAvailable = (await commands.run("sudo", ["-v"])).code === 0;
const executionOrder: ComponentId[] = [];
const visited = new Set<ComponentId>();
const visit = (id: ComponentId): void => {
  if (visited.has(id) || !state.selected.has(id)) return;
  visited.add(id);
  const item = catalog.find((entry) => entry.id === id);
  for (const dependency of item?.requires ?? []) visit(dependency);
  executionOrder.push(id);
};
for (const item of catalog) visit(item.id);
if (state.selected.has("keyd") && state.selected.has("keyd-config")) {
  executionOrder.splice(executionOrder.indexOf("keyd"), 1);
  executionOrder.splice(executionOrder.indexOf("keyd-config"), 0, "keyd");
}
for (const id of executionOrder) {
  try {
    if (dryRun) {
      const paths = configurationLinks[id];
      if (paths) console.log(`${id}: ${paths.map(([source,target]) => `link ${source} -> ${target}`).join(", ")}`);
      else console.log(`${id}: ${softwareStates.get(id)?.route ?? "selected operation"}${softwareStates.get(id)?.reason ? ` (${softwareStates.get(id)?.reason})` : ""}`);
      results.push({ id, status:"unchanged", attention:[] }); continue;
    }
    if (id === "omp-config") await assertOmpAgentDirectoryIsReal(home);
    if (id === "aerospace-config") {
      const alternate = join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "aerospace/aerospace.toml");
      const existing = await lstat(alternate).catch(() => undefined);
      if (existing) await fileLinks.backup(alternate);
    }
    const links = configurationLinks[id];
    if (links) {
      const messages: string[] = [];
      for (const [source, destination] of links) if (await fileLinks.ensureLink(join(root, source), join(home, destination)) === "changed") messages.push(destination);
      if (id === "git-config" && fileLinks.backupDirectory) {
        const backup = join(fileLinks.backupDirectory, ".gitconfig");
        if (await lstat(backup).then(() => true).catch(() => false)) {
          const migration = await migrateGitIdentity(backup, home);
          if (migration.migrated) attentionNotes.push("Migrated prior Git identity/signing settings to ~/.gitconfig.local; review the file.");
          if (migration.conflict) attentionNotes.push("Prior Git identity data remains in the backup because ~/.gitconfig.local already exists.");
        }
      }
      if (id === "zsh-config" && fileLinks.backupDirectory) {
        const backup = join(fileLinks.backupDirectory, ".config/zsh");
        if (await lstat(backup).then(() => true).catch(() => false)) {
          const migration = await migrateZshLocal(fileLinks.backupDirectory, root);
          if (migration.conflict) attentionNotes.push("Prior local.zsh remains in the backup because the repository local override already exists.");
        }
      }
      if (id === "tmux-config" && messages.includes(".tmux.conf")) {
        const tmux = host.executables.get("tmux");
        if (tmux && (await commands.run(tmux, ["list-sessions"])).code === 0) {
          const reloaded = await commands.run(tmux, ["source-file", join(home, ".tmux.conf")]);
          if (reloaded.code !== 0) attentionNotes.push("The tmux configuration link changed, but the active tmux server could not reload it.");
        }
      }
      for (const prerequisite of configurationPrerequisites[id] ?? []) {
        if (!recipeContext.host.executables.has(prerequisite) && !softwareStates.get(prerequisite as ComponentId)?.installed) attentionNotes.push(`${id} was linked, but the optional ${prerequisite} executable is not available.`);
      }
      const status = messages.length ? "changed" : "unchanged";
      console.log(`${id}: ${status}`); results.push({ id, status, attention:[] }); continue;
    }
    let outcome: { id:string; status:"changed"|"unchanged"|"blocked"|"failed"; attention:string[] };
    if (["zsh-abbr","tmuxscope","tmux-plugins"].includes(id)) {
      const recipe = id === "zsh-abbr" ? installZshAbbr : id === "tmuxscope" ? installTmuxscope : installTmuxPlugins;
      outcome = await recipe(recipeContext);
    } else if (id === "alacritty" && host.platform === "darwin" && softwareStates.get(id)?.route === "source") outcome = await installAlacrittySource(recipeContext);
    else if (id === "keyd" && softwareStates.get(id)?.route === "keyd-source-build" && !sudoAvailable) outcome = { id, status: "blocked", attention: ["Elevation was declined or unavailable; rerun the keyd build with sudo."] };
    else if (id === "keyd" && softwareStates.get(id)?.route === "keyd-source-build") outcome = await installKeydFromSource(recipeContext);
    else if (id === "keyd-config" && !sudoAvailable) outcome = { id, status: "blocked", attention: ["Elevation was declined or unavailable; manually install the selected /etc/keyd links with sudo."] };
    else if (id === "keyd-config") outcome = await installKeyd(recipeContext);
    else if (id === "gnome-apply") outcome = await applyGnome(recipeContext);
    else {
      if ((["apt", "apt-fontconfig"].includes(softwareStates.get(id)?.route ?? "") || id === "linux-desktop" || id === "keyd") && !sudoAvailable) outcome = { id, status:"blocked", attention:["Elevation was declined or unavailable; rerun the exact package command with sudo."] };
      else {
        const result = await installRecipe(recipeContext, id);
        if (result.code !== 0) outcome = { id, status:"failed", attention:[result.stderr || `${id} failed with exit ${result.code}`] };
        else if (result.stdout.includes("already")) outcome = { id, status:"unchanged", attention:[] };
        else outcome = { id, status:"changed", attention:[] };
      }
    }
    if (outcome.status === "changed" && softwareStates.has(id)) {
      await refreshHost();
      const verified = await inspectPackage(recipeContext, id);
      if (!verified.installed) outcome = { id, status:"failed", attention:[verified.reason ?? `${id} did not pass executable or installation verification after its recipe ran.`] };
    }
    console.log(`${id}: ${outcome.status}`); results.push({ id, status:outcome.status, attention:outcome.attention });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${id}: ${message}`); results.push({ id, status:"failed", attention:[message] });
  }
}
const counts = Object.fromEntries(["changed","unchanged","blocked","failed"].map((status) => [status, results.filter((result) => result.status === status).length]));
console.log(`Results: ${counts.changed} changed, ${counts.unchanged} unchanged, ${counts.blocked} blocked, ${counts.failed} failed.`);
if (fileLinks.backupDirectory) console.log(`Backups: ${fileLinks.backupDirectory}`);
if (fileLinks.backupDirectory) for (const path of await scanBackupForCredentials(fileLinks.backupDirectory)) attentionNotes.push(`Possible credential-shaped data in backup file ${path}; move secrets to the documented untracked local file and rotate them.`);
const attention = [...attentionNotes, ...results.flatMap((result) => result.attention)];
if (attention.length) { console.log("Needs your attention:"); for (const note of attention) console.log(`- ${note}`); }
if (results.some((result) => result.status === "blocked" || result.status === "failed")) process.exitCode = 1;
