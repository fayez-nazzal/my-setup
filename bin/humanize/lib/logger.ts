import type { LogEvent } from "./types.ts";

/**
 * Human-readable, JSON-lines run log. Meant for `tail`/manual reading — the
 * calling skill must never pipe this back into an LLM/agent context. Only
 * the log file *path* is ever printed (to stderr), never its contents.
 */
export class RunLogger {
  private readonly events: LogEvent[] = [];
  private readonly startedAt = new Date();

  log(event: LogEvent): void {
    this.events.push({ ...event, ts: new Date().toISOString() });
  }

  /** Writes the log to `<logDir>/<timestamp>-<pid>.jsonl` and returns its path. */
  async flush(logDir: string): Promise<string> {
    await Bun.$`mkdir -p ${logDir}`.quiet();
    const stamp = this.startedAt.toISOString().replace(/[:.]/g, "-");
    const path = `${logDir}/${stamp}-${process.pid}.jsonl`;
    const lines = this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await Bun.write(path, lines);
    return path;
  }
}
