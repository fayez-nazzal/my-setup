export interface CommandOptions { cwd?: string; env?: Record<string, string>; stdin?: "inherit" | "ignore"; quiet?: boolean }
export interface CommandResult { code: number; stdout: string; stderr: string }
export interface CommandRunner { run(command: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult> }
