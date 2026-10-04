import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { prompt } from "./commands";
import type { RecipeContext } from "./packages";
import type { ComponentId } from "../domain/model";

/** TCC grants belong to the responsible terminal/app. Probe real capabilities; never claim to grant them programmatically. */
export async function prepareMacPermissions(c: RecipeContext, selected: ReadonlySet<ComponentId>): Promise<Map<ComponentId, string>> {
  const blocked = new Map<ComponentId, string>();
  if (c.host.platform !== "darwin") return blocked;
  const authorize = async (id: ComponentId, title: string, settings: string, instruction: string, probe: () => Promise<boolean>) => {
    if (await probe()) return;
    console.log(`Permission needed before ${id}: ${title}. ${instruction}`);
    await c.run("/usr/bin/open", [`x-apple.systempreferences:com.apple.preference.security?${settings}`], { quiet: true });
    while (true) {
      const answer = await prompt("Grant access in System Settings, then press Enter to retry; type skip to leave this operation blocked: ");
      if (answer.toLowerCase() === "skip" || !process.stdin.isTTY) { blocked.set(id, `${title} was not granted. ${instruction}`); return; }
      if (await probe()) return;
      console.log(`Access is still unavailable. ${instruction}`);
    }
  };
  if (selected.has("amphetamine-config")) {
    await authorize("amphetamine-config", "Automation → System Events", "Privacy_Automation", "Approve the terminal's request to control System Events; it is needed to inspect and add the Amphetamine login item.", async () => (await c.run("/usr/bin/osascript", ["-e", 'tell application "System Events" to get the path of every login item'], { quiet: true, stdin: "ignore" })).code === 0);
    const available = await access("/Applications/Amphetamine.app/Contents/MacOS/Amphetamine").then(() => true, () => false);
    if (available && !blocked.has("amphetamine-config")) {
      await c.run("/usr/bin/open", ["-a", "Amphetamine"], { quiet: true });
      await authorize("amphetamine-config", "Automation → Amphetamine", "Privacy_Automation", "Approve the terminal's request to control Amphetamine so it can configure and start the keep-awake session.", async () => (await c.run("/usr/bin/osascript", ["-e", 'tell application "Amphetamine" to session is active'], { quiet: true, stdin: "ignore" })).code === 0);
      if (!blocked.has("amphetamine-config")) {
        const folder = join(c.home, "Library/Containers/com.if.Amphetamine/Data/Library");
        await authorize("amphetamine-config", "Amphetamine app-data access", "Privacy_AllFiles", "Allow this terminal to access Amphetamine's app data when macOS asks, or enable Full Disk Access for the terminal that launched this installer. macOS may require restarting that terminal and rerunning the installer.", async () => {
          try { await readdir(folder); return true; }
          catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === "ENOENT") return true; if (code === "EACCES" || code === "EPERM") return false; throw error; }
        });
      }
    }
  }
  const aerospaceIds = ["aerospace-config"] as const;
  const aerospace = c.host.executables.get("aerospace");
  if (aerospace && aerospaceIds.some(id => selected.has(id))) {
    // AeroSpace itself needs Accessibility, not unrestricted device or screen-recording access for this installer.
    await c.run("/usr/bin/open", ["-a", "AeroSpace"], { quiet: true });
    for (const id of aerospaceIds.filter(id => selected.has(id))) await authorize(id, "AeroSpace Accessibility", "Privacy_Accessibility", "Enable AeroSpace under Accessibility. The app must be running for its CLI to respond.", async () => (await c.run(aerospace, ["list-workspaces", "--all"], { quiet: true, stdin: "ignore" })).code === 0);
  }
  return blocked;
}
