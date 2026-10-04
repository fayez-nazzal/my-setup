import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const zsh = Bun.which("zsh"), tmux = Bun.which("tmux");
const helper = resolve(import.meta.dir, "../../bin/my-setup-alacritty-shell");
const homes: string[] = [];
const environment = (home: string) => ({ ...process.env, HOME: home, ZDOTDIR: home, TMUX: "", TMUX_PANE: "", TMUX_TMPDIR: join(home, "sockets"), TERM: "xterm-256color" });
const run = (home: string, args: string[]) => Bun.spawnSync(args, { env: environment(home), stdin: "ignore", stdout: "pipe", stderr: "pipe" });

async function fixture() {
  // Keep Unix socket paths below macOS's length limit; no live tmux server is touched.
  const home = await mkdtemp("/tmp/alacritty-guard-");
  homes.push(home);
  await mkdir(join(home, "sockets"), { mode: 0o700 });
  await mkdir(join(home, ".cache/my-setup/AeroSpace"), { recursive: true });
  await chmod(join(home, ".cache/my-setup"), 0o755);
  return home;
}

afterEach(async () => {
  for (const home of homes.splice(0)) {
    if (tmux) run(home, [tmux, "kill-server"]);
    await rm(home, { recursive: true, force: true });
  }
});

describe.skipIf(!zsh || !tmux)("Alacritty shared cache", () => {
  test("an AeroSpace-created cache is secured and reaches the real default tmux session", async () => {
    const home = await fixture();
    // No GUI/TTY in the suite: attachment ends, but the real detached session
    // proves startup passed the guard. Interactive attachment is smoke-tested separately.
    run(home, [zsh!, "-f", helper]);
    const sessions = run(home, [tmux!, "list-sessions", "-F", "#{session_name} #{@my_setup_default_alacritty}"]);
    expect(sessions.exitCode).toBe(0);
    expect(sessions.stdout.toString().trim()).toBe("main 1");
    expect((await stat(join(home, ".cache/my-setup"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(home, ".cache/my-setup/alacritty-default.lock"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, ".cache/my-setup/AeroSpace"))).isDirectory()).toBe(true);
  });

  test("a symlinked cache is refused without changing its target permissions", async () => {
    const home = await fixture();
    const target = join(home, ".cache/my-setup");
    await mkdir(join(home, "linked-home/.cache"), { recursive: true });
    await mkdir(join(home, "linked-home/sockets"), { mode: 0o700 });
    await symlink(target, join(home, "linked-home/.cache/my-setup"));
    const result = run(join(home, "linked-home"), [zsh!, "-f", helper]);
    expect(result.exitCode).toBe(1);
    expect((await stat(target)).mode & 0o777).toBe(0o755);
    expect(run(home, [tmux!, "list-sessions"]).exitCode).not.toBe(0);
  });
});
