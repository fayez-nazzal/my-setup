import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import type { CommandOptions, CommandResult, CommandRunner } from "../application/ports";
export const commands: CommandRunner = {
  run(command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandResult> {
    const { promise, resolve, reject } = Promise.withResolvers<CommandResult>();
    const forwardOutput = !options.quiet;
    const inherited = new Set(options.inherit ?? []);
    const child = spawn(command, [...args], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: [options.stdin === "ignore" ? "ignore" : "inherit", inherited.has("stdout") ? "inherit" : "pipe", inherited.has("stderr") ? "inherit" : "pipe"] });
    let stdout = "", stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { const value = chunk.toString(); stdout += value; if (forwardOutput) process.stdout.write(value); });
    child.stderr?.on("data", (chunk: Buffer) => { const value = chunk.toString(); stderr += value; if (forwardOutput) process.stderr.write(value); });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    return promise;
  },
};

/** Lines that arrived with an earlier answer (pasted or piped input); later questions consume them in order. */
const pendingLines: string[] = [];
/** Ask one question on the terminal; returns the trimmed answer (empty on EOF). */
export async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const queued = pendingLines.shift();
  if (queued !== undefined) { process.stdout.write("\n"); return queued.trim(); }
  const reader = createInterface({ input: process.stdin, terminal: false });
  try {
    return await new Promise<string>(resolve => {
      let answered = false;
      reader.on("line", line => { if (answered) pendingLines.push(line); else { answered = true; resolve(line.trim()); } });
      reader.once("close", () => { if (!answered) { answered = true; resolve(""); } });
    });
  } finally { reader.close(); }
}

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
