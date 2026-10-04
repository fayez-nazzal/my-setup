/** `inherit` connects the named streams straight to the terminal (prompts, `eval $(op signin)`-style capture); they are not captured. */
export interface CommandOptions { cwd?: string; env?: Record<string, string>; stdin?: "inherit" | "ignore"; quiet?: boolean; inherit?: readonly ("stdout" | "stderr")[] }
export interface CommandResult { code: number; stdout: string; stderr: string }
export interface CommandRunner { run(command: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult> }
