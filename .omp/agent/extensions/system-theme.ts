import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

// The Alacritty synchronizer atomically replaces this file on system changes.
export default function systemTheme(pi: ExtensionAPI) {
  const directory = join(homedir(), ".config/alacritty");
  let watcher: FSWatcher | undefined;
  let revision = 0;
  let applied: string | undefined;

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const refresh = async () => {
      const request = ++revision;
      const content = await readFile(join(directory, "theme.toml"), "utf8").catch(() => "");
      const mode = /^# (Light|Dark) palette selected by theme-sync\.sh /m.exec(content)?.[1]?.toLowerCase();
      if (!mode || request !== revision) return;
      const name = mode === "dark" ? "dark-dracula-hc" : "light-cyberpunk-hc";
      if (applied !== name) {
        const result = await ctx.ui.setTheme(name);
        if (result.success && request === revision) applied = name;
      }
    };
    try {
      watcher = watch(directory, (_event, filename) => {
        if (!filename || filename.toString() === "theme.toml") void refresh();
      });
      watcher.on("error", error => pi.logger.warn("System theme watcher failed", { error: String(error) }));
    } catch (error) {
      pi.logger.warn("System theme watcher unavailable", { error: String(error) });
    }
    await refresh();
  });
  pi.on("session_shutdown", () => { watcher?.close(); watcher = undefined; });
}
