import { spawn } from "node:child_process";
import type { CommandOptions, CommandResult, CommandRunner } from "../application/ports";
export const commands: CommandRunner = {
  run(command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { promise, resolve, reject } = Promise.withResolvers<CommandResult>();
    const forwardOutput = !options.quiet;
    const child = spawn(command, [...args], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: [options.stdin === "ignore" ? "ignore" : "inherit", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { const value = chunk.toString(); stdout += value; if (forwardOutput) process.stdout.write(value); });
    child.stderr.on("data", (chunk: Buffer) => { const value = chunk.toString(); stderr += value; if (forwardOutput) process.stderr.write(value); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    return promise;
  },
};

let sudoSession: Promise<boolean> | undefined;
/**
 * Authenticate sudo the first time elevation is needed; sudo prompts on the terminal.
 * A successful prompt keeps the credential cache warm so long builds never re-prompt mid-run.
 */
export function ensureSudo(): Promise<boolean> {
  sudoSession ??= (async () => {
    if ((await commands.run("sudo", ["-n", "-v"], { quiet: true, stdin: "ignore" })).code !== 0) {
      console.log("Administrator access is needed; sudo will ask for your password.");
      if ((await commands.run("sudo", ["-v"])).code !== 0) { sudoSession = undefined; return false; }
    }
    setInterval(() => { spawn("sudo", ["-n", "-v"], { stdio: "ignore" }).on("error", () => undefined); }, 60_000).unref();
    return true;
  })();
  return sudoSession;
}
