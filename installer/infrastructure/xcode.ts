import { join } from "node:path";
import type { RecipeContext, SoftwareState } from "./packages";
import type { ToolResult } from "./tools";
import { ensureSudo } from "./commands";
const helper = (c: RecipeContext) => join(c.repoRoot, "installer/infrastructure/xcode-bootstrap.sh");

/** Verify full Xcode rather than mistaking the standalone Command Line Tools for a complete installation. */
export async function inspectXcode(c: RecipeContext): Promise<SoftwareState> {
  if (c.host.platform !== "darwin") return { installed: true, healthy: true };
  const result = await c.run("/bin/bash", [helper(c), "inspect"], { quiet: true });
  return result.code === 0
    ? { installed: true, healthy: true }
    : { installed: false, healthy: false, reason: "Full Xcode must be installed, selected, licensed, and initialized; rerun install.sh to repair it." };
}

/** Configure full Xcode using the same bootstrap path that runs before Bun and Homebrew exist. */
export async function configureXcode(c: RecipeContext): Promise<ToolResult> {
  const before = await inspectXcode(c);
  if (before.healthy) return { id: "xcode", status: "unchanged", attention: [] };
  if (!await ensureSudo()) return { id: "xcode", status: "blocked", attention: ["Administrator authorization is required to configure Xcode."] };
  const result = await c.run("/bin/bash", [helper(c), "configure"], { inherit: ["stdout", "stderr"] });
  if (result.code !== 0) return { id: "xcode", status: "failed", attention: ["Full Xcode setup did not complete; follow the reported action and rerun."] };
  const after = await inspectXcode(c);
  return after.healthy
    ? { id: "xcode", status: "changed", attention: [] }
    : { id: "xcode", status: "failed", attention: ["Xcode setup returned without a healthy full Xcode installation."] };
}
