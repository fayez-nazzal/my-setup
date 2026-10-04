import { constants } from "node:fs";
import { access, lstat } from "node:fs/promises";
import { BoxRenderable, TextRenderable, createCliRenderer } from "@opentui/core";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { catalog, configurationLinks, configurationPrerequisites, desktopOnly, retiredConfigurationLinks, runAfter } from "./domain/catalog";
import { initialSelection, reduceSelection } from "./domain/selection";
import type { ComponentAvailability, ComponentId, ComponentResult } from "./domain/model";
import { UserFileLinks, assertOmpAgentDirectoryIsReal, migrateGitIdentity, migrateZshLocal, scanBackupForCredentials } from "./infrastructure/links";
import { inspectHost } from "./infrastructure/host";
import { inspectPackage, installRecipe, packageSudoRoutes } from "./infrastructure/packages";
import type { SoftwareState } from "./infrastructure/packages";
import { amphetamineApp, appIds, appSudoRoutes, inspectApp, installApp, opSshSignPath } from "./infrastructure/apps";
import { configureGitSigning, currentSigningMethod, ensureGhAuth, gitConfigTarget, signingItems, signingKeyPath } from "./infrastructure/github";
import { ensureOpSession } from "./infrastructure/onepassword";
import { configureJavaHome, inspectRuntime, installRuntime, runtimeIds, runtimeSudoRoutes } from "./infrastructure/runtimes";
import { configureXcode, inspectXcode } from "./infrastructure/xcode";
import { prepareMacPermissions } from "./infrastructure/permissions";
import { githubToolsScript, installAerospaceSource, installAlacrittySource, installGithubToolsCron, installTmuxPlugins, installZshAbbr, syncGithubTools } from "./infrastructure/tools";
import { amphetamineSettings, applyAmphetamine, applyGnome, applyMacDefaults, installKeyd, installKeydFromSource, macDefaultWriteArgs, macDefaults } from "./infrastructure/desktop";
import { commands, ensureSudo } from "./infrastructure/commands";

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
const softwareIds: ComponentId[] = ["zsh","git","tmux","starship","zoxide","fzf","bat","eza","fd","ripgrep","thefuck","killport","volta","node-lts","aws-cli","corretto21","alacritty","nerd-font","1password-cli","1password","gh","obsidian","aerospace","google-chrome","orbstack","amphetamine","linux-desktop","keyd"];
const softwareStates = new Map<ComponentId, SoftwareState>();
const inspect = (id: ComponentId) => runtimeIds.has(id) ? inspectRuntime(recipeContext, id) : appIds.has(id) ? inspectApp(recipeContext, id) : inspectPackage(recipeContext, id);
const sudoRoutes = new Set([...packageSudoRoutes, ...appSudoRoutes, ...runtimeSudoRoutes]);
const headless = (id: ComponentId) => host.platform === "linux" && !host.graphical && desktopOnly.has(id);
const headlessReason = "This Linux host is headless (no display, desktop session, or graphical target); desktop-only.";
// Direct `bun run cli.ts` must not bypass the macOS bootstrap prerequisite either.
if (host.platform === "darwin" && !dryRun && !(await inspectXcode(recipeContext)).installed) {
  const xcode = await configureXcode(recipeContext);
  if (xcode.status === "blocked" || xcode.status === "failed") {
    console.error(`Full Xcode is required before macOS setup: ${xcode.attention.join("; ")}`);
    process.exit(1);
  }
  await refreshHost();
}
// Refresh Homebrew's index first so missing tools install, and outdated ones are detected, at their latest versions.
if (!dryRun && host.packageManagers.brew) {
  console.log("Updating Homebrew…");
  if ((await commands.run(host.packageManagers.brew, ["update", "--quiet"], { quiet: true })).code !== 0) console.log("Homebrew update failed; continuing with the current package index.");
}
console.log("Inspecting installed software…");
for (const id of softwareIds) {
  if (headless(id)) { softwareStates.set(id, { installed:false, healthy:false, reason:headlessReason }); continue; }
  try { softwareStates.set(id, await inspect(id)); }
  catch (error) { softwareStates.set(id, { installed:false, healthy:false, reason:error instanceof Error ? error.message : String(error) }); }
}
for (const item of catalog) {
  let enabled = item.platforms.includes(host.platform);
  let reason = enabled ? undefined : `Available only on ${item.platforms.join(" or ")}.`;
  let installed = false;
  const state = softwareStates.get(item.id);
  if (state) { installed = state.installed; if (!state.installed && !state.route) { enabled = false; reason = state.reason ?? "No supported installation route is available."; } }
  const outdated = Boolean(state?.installed && state.outdated && state.route);
  if (item.id === "zsh-abbr" || item.id === "github-tools" || item.id === "github-tools-cron" || item.id === "tmux-plugins") { enabled = item.platforms.includes(host.platform); }
  if (item.id === "gnome-apply") { enabled = host.platform === "linux" && host.gnome.active && Boolean(host.gnome.dbusAddress) && Boolean(host.gnome.dconf); if (!enabled) reason = "Active GNOME session, DBus address, and dconf are required."; }
  if (item.id === "keyd-config") enabled = host.platform === "linux";
  if (item.id === "xcode" && host.platform === "darwin") {
    const xcode = await inspectXcode(recipeContext);
    installed = xcode.installed;
  }
  if (headless(item.id)) { enabled = false; reason = headlessReason; }
  availability.set(item.id, { enabled, reason, installed, outdated });
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
  const rows: string[] = [`Interactive installer · ${host.platform} · ${host.architecture}${host.platform === "linux" && !host.graphical ? " · headless" : ""}`, "Supported choices are selected by default", ""];
  const rendered: string[] = [];
  const componentRows: number[] = [];
  let group = "";
  catalog.forEach((item, index) => {
    if (item.group !== group) { group = item.group; rendered.push(`── ${group} ──`); }
    const option = availability.get(item.id)!;
    const marker = option.enabled && state.selected.has(item.id) ? "[x]" : "[ ]";
    componentRows[index] = rendered.length;
    rendered.push(`${index === state.cursor ? ">" : " "} ${marker} ${item.label}${option.enabled ? "" : ` (disabled: ${option.reason})`}${option.outdated ? " (installed, update available)" : option.installed ? " (installed)" : ""}`);
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
const permissionBlocks = dryRun ? new Map<ComponentId, string>() : await prepareMacPermissions(recipeContext, state.selected);
const selectedSoftware = [...state.selected].filter((id) => softwareStates.has(id));
const needsSudo = (selectedSoftware.some((id) => sudoRoutes.has(softwareStates.get(id)?.route ?? "") || (host.platform === "linux" && id === "keyd" && !softwareStates.get(id)?.installed))) || state.selected.has("keyd-config") || (host.platform === "linux" && state.selected.has("github-tools-cron") && !host.executables.has("crontab"));
let sudoAvailable = true;
if (!dryRun && needsSudo) sudoAvailable = await ensureSudo();
const executionOrder: ComponentId[] = [];
const visited = new Set<ComponentId>();
// Configuration links run after the selected software they configure, so prerequisite checks see the installed tools.
const visit = (id: ComponentId): void => {
  if (visited.has(id) || !state.selected.has(id)) return;
  visited.add(id);
  const item = catalog.find((entry) => entry.id === id);
  for (const dependency of item?.requires ?? []) visit(dependency);
  for (const prerequisite of configurationPrerequisites[id] ?? []) if (catalog.some((entry) => entry.id === prerequisite)) visit(prerequisite as ComponentId);
  for (const earlier of runAfter[id] ?? []) visit(earlier);
  executionOrder.push(id);
};
// Ask account/integration approvals as soon as their apps/CLIs are ready, before long builds.
for (const early of ["xcode", "1password", "1password-cli", "1password-signin", "gh", "gh-auth", "git-signing"] as const) visit(early);
for (const item of catalog) visit(item.id);
for (const id of executionOrder) {
  if (permissionBlocks.has(id)) {
    console.log(`${id}: blocked`); results.push({ id, status: "blocked", attention: [permissionBlocks.get(id)!] }); continue;
  }
  if (!dryRun && (id === "amphetamine-config" || id === "aerospace-config")) {
    const denied = await prepareMacPermissions(recipeContext, new Set([id]));
    if (denied.has(id)) {
      console.log(`${id}: blocked`); results.push({ id, status: "blocked", attention: [denied.get(id)!] }); continue;
    }
  }
  try {
    if (dryRun) {
      const paths = configurationLinks[id];
      const retired = (retiredConfigurationLinks[id] ?? []).map(([source,target]) => `remove ${target} if it links to ${source}`);
      if (paths) console.log(`${id}: ${[...paths.map(([source,target]) => `link ${source} -> ${target}`), ...retired].join(", ")}`);
      else if (id === "macos-defaults") console.log(`${id}: where different, ${macDefaults.map(setting => `defaults ${macDefaultWriteArgs(setting).join(" ")}`).join("; ")}`);
      else if (id === "amphetamine-config") console.log(`${id}: where different, ${(await amphetamineSettings(recipeContext)).map(setting => `defaults ${macDefaultWriteArgs(setting).join(" ")}`).join("; ")}; add ${amphetamineApp} to login items; start a session`);
      else if (id === "xcode") console.log(`${id}: verify full Xcode selection, license, first-launch components, and macOS SDK; offer App Store installation and repair only when needed`);
      else if (id === "java-home") console.log(`${id}: install the managed zsh login snippet; resolve and verify Corretto 21 JAVA_HOME and put its bin first on PATH`);
      else if (id === "github-tools" || id === "github-tools-cron") {
        const plan = await commands.run(githubToolsScript(root), id === "github-tools" ? ["list"] : ["cron", "show"], { quiet: true });
        console.log(`${id}: ${id === "github-tools" ? "sync" : "crontab entry"}\n${plan.stdout.trimEnd().replace(/^/gm, "  ")}`);
      }
      else if (id === "1password-signin") console.log(`${id}: install op when missing; check op vault access; otherwise enable the app's CLI integration, or op account add + op signin (interactive)`);
      else if (id === "gh-auth") console.log(`${id}: check gh auth status; otherwise gh auth login --web with the admin:ssh_signing_key and write:gpg_key scopes (interactive)`);
      else if (id === "git-signing") {
        const git = host.executables.get("git");
        const target = git ? (await gitConfigTarget(recipeContext, git)).at(-1) : "~/.gitconfig.local";
        const method = git ? await currentSigningMethod(recipeContext, git) : undefined;
        const signer = await access(opSshSignPath(host.platform), constants.X_OK).then(() => `op-ssh-sign (${opSshSignPath(host.platform)})`, () => `ssh-keygen with ${signingKeyPath(home)} encrypted by “${signingItems.passphrase}”`);
        const gpgPlan = `OpenPGP: gpg + pinentry, the configured key or 1Password “${signingItems.gpgSecretKey}” (offer a backup when missing), unlocked by “${signingItems.passphrase}”; set gpg.format=openpgp, user.signingkey, commit.gpgsign=true`;
        const sshPlan = `SSH: 1Password “${signingItems.sshKey}” signed by ${signer}; set gpg.format=ssh, user.signingkey, gpg.ssh.program, gpg.ssh.allowedSignersFile, commit.gpgsign=true`;
        console.log(`${id}: ${method === "openpgp" ? gpgPlan : method === "ssh" ? sshPlan : `ask which method — ${gpgPlan} | ${sshPlan}`} in ${target}; register the key on GitHub; verify a test commit`);
      }
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
      for (const [source, destination] of retiredConfigurationLinks[id] ?? []) if (await fileLinks.removeRetiredLink(join(root, source), join(home, destination)) === "changed") messages.push(`removed ${destination}`);
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
        const tmux = recipeContext.host.executables.get("tmux");
        if (tmux && (await commands.run(tmux, ["list-sessions"])).code === 0) {
          const reloaded = await commands.run(tmux, ["source-file", join(home, ".tmux.conf")]);
          if (reloaded.code !== 0) attentionNotes.push("The tmux configuration link changed, but the active tmux server could not reload it.");
        }
      }
      if (id === "alacritty-config") {
        const alacritty = recipeContext.host.executables.get("alacritty");
        const version = alacritty ? /alacritty\s+(\d+)\.(\d+)/.exec((await commands.run(alacritty, ["--version"], { quiet: true })).stdout) : null;
        if (version && Number(version[1]) === 0 && Number(version[2]) < 14) attentionNotes.push(`Alacritty ${version[1]}.${version[2]} ignores terminal.shell, so its windows will not open in tmux; install Alacritty 0.14 or newer.`);
      }
      for (const prerequisite of configurationPrerequisites[id] ?? []) {
        if (!recipeContext.host.executables.has(prerequisite) && !softwareStates.get(prerequisite as ComponentId)?.installed) attentionNotes.push(`${id} was linked, but the optional ${prerequisite} executable is not available.`);
      }
      const status = messages.length ? "changed" : "unchanged";
      console.log(`${id}: ${status}`); results.push({ id, status, attention:[] }); continue;
    }
    let outcome: { id:string; status:"changed"|"unchanged"|"blocked"|"failed"; attention:string[] };
    if (["zsh-abbr","tmux-plugins","github-tools","github-tools-cron"].includes(id)) {
      const recipe = id === "zsh-abbr" ? installZshAbbr : id === "github-tools" ? syncGithubTools : id === "github-tools-cron" ? installGithubToolsCron : installTmuxPlugins;
      outcome = await recipe(recipeContext);
    } else if (id === "alacritty" && host.platform === "darwin" && softwareStates.get(id)?.route === "source") outcome = await installAlacrittySource(recipeContext);
    else if (id === "aerospace" && softwareStates.get(id)?.route === "aerospace-source") outcome = await installAerospaceSource(recipeContext);
    else if (id === "keyd" && softwareStates.get(id)?.route === "keyd-source-build" && !sudoAvailable) outcome = { id, status: "blocked", attention: ["Elevation was declined or unavailable; rerun the keyd build with sudo."] };
    else if (id === "keyd" && softwareStates.get(id)?.route === "keyd-source-build") outcome = await installKeydFromSource(recipeContext);
    else if (id === "keyd-config" && !sudoAvailable) outcome = { id, status: "blocked", attention: ["Elevation was declined or unavailable; manually install the selected /etc/keyd links with sudo."] };
    else if (id === "keyd-config") outcome = await installKeyd(recipeContext);
    else if (id === "gnome-apply") outcome = await applyGnome(recipeContext);
    else if (id === "macos-defaults") outcome = await applyMacDefaults(recipeContext);
    else if (id === "amphetamine-config") outcome = await applyAmphetamine(recipeContext, amphetamineApp);
    else if (id === "xcode") outcome = await configureXcode(recipeContext);
    else if (id === "java-home") outcome = await configureJavaHome(recipeContext);
    else if (id === "1password-signin") {
      const session = await ensureOpSession(recipeContext);
      outcome = session.ok ? { id, status: session.changed ? "changed" : "unchanged", attention: [] } : { id, status: "blocked", attention: [session.reason] };
    }
    else if (id === "gh-auth") outcome = await ensureGhAuth(recipeContext);
    else if (id === "git-signing") outcome = await configureGitSigning(recipeContext);
    else {
      if ((sudoRoutes.has(softwareStates.get(id)?.route ?? "") || id === "linux-desktop" || id === "keyd") && !sudoAvailable) outcome = { id, status:"blocked", attention:["Elevation was declined or unavailable; rerun the exact package command with sudo."] };
      else {
        const result = runtimeIds.has(id) ? await installRuntime(recipeContext, id) : appIds.has(id) ? await installApp(recipeContext, id) : await installRecipe(recipeContext, id);
        if (result.code !== 0) outcome = { id, status:"failed", attention:[result.stderr || `${id} failed with exit ${result.code}`] };
        else if (result.stdout.includes("already")) outcome = { id, status:"unchanged", attention:[] };
        else outcome = { id, status:"changed", attention:[] };
      }
    }
    if (outcome.status === "changed") await refreshHost();
    if (outcome.status === "changed" && softwareStates.has(id)) {
      const verified = await inspect(id);
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
