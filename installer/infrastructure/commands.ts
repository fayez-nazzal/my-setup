import { spawn } from "node:child_process";
import type { CommandOptions, CommandResult, CommandRunner } from "../application/ports";
export const commands: CommandRunner = {
  run(command: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const forwardOutput = !options.quiet;
      const child = spawn(command, [...args], { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: [options.stdin === "ignore" ? "ignore" : "inherit", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { const value = chunk.toString(); stdout += value; if (forwardOutput) process.stdout.write(value); });
      child.stderr.on("data", (chunk: Buffer) => { const value = chunk.toString(); stderr += value; if (forwardOutput) process.stderr.write(value); });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  },
};
