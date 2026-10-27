import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join, resolve } from "node:path";

// Exercises the real omp() launcher from the aliases file under `zsh -f`.
// Every external (op, omp, uname, secret-tool) is a synthetic stub on a private
// PATH; HOME/ZDOTDIR are temporary. The real OS credential store is never read:
// the Darwin branch calls /usr/bin/security by absolute path, so it is not run here.
const zsh = Bun.which("zsh");
const aliases = resolve(import.meta.dir, "../../zsh/.config/zsh/rc.d/70-aliases.zsh");
const secrets = resolve(import.meta.dir, "../../zsh/.config/zsh/rc.d/65-secrets.zsh");
const SCOPED = "svc-SYNTHETIC-scoped-0001";
const PERPLEXITY = "pplx-SYNTHETIC-0002";
const CALLER = "caller-SYNTHETIC-0003";
const AMBIENT = "ambient-SYNTHETIC-0004";
const SESSION = "session-SYNTHETIC-0005";
const homes: string[] = [];

interface OmpRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const parentScript = [
  'source "$SECRETS_FILE"',
  'source "$ALIASES_FILE"',
  '[[ -n "$PARENT_XTRACE" ]] && setopt xtrace',
  'omp --model example "arg with space"',
  'print -r -- "exit=$?"',
  'print -r -- "parent-session=${OP_SESSION_test-unset}"',
  'print -r -- "parent-scoped=${OP_SERVICE_ACCOUNT_TOKEN-unset}"',
  'print -r -- "parent-perplexity=${PERPLEXITY_API_KEY-unset}"',
  "",
].join("\n");

const stubs: Record<string, string> = {
  uname: 'printf \'%s\\n\' "${FAKE_UNAME:-Linux}"',
  op: [
    'printf \'%s token=%s\\n\' "$*" "${OP_SERVICE_ACCOUNT_TOKEN-unset}" >> "$FAKE_LOG/op.log"',
    'if [ "$1" = whoami ]; then',
    '  [ -n "${FAKE_AUTH_FAIL-}" ] && { echo "[ERROR] invalid service-account credentials" >&2; exit 1; }',
    "  exit 0",
    "fi",
    'if [ "$1" = read ] && [ "$2" = "op://OMP/Perplexity Web Search/password" ]; then',
    '  [ -n "${FAKE_PERPLEXITY_FAIL-}" ] && { echo "[ERROR] \\"Perplexity Web Search\\" isn\'t an item in the \\"OMP\\" vault" >&2; exit 1; }',
    `  printf '%s' '${PERPLEXITY}'`,
    "  exit 0",
    "fi",
    "exit 1",
  ].join("\n"),
  "secret-tool": [
    'printf \'%s\\n\' "$*" >> "$FAKE_LOG/secret.log"',
    '[ -n "${FAKE_SECRET_FAIL-}" ] && exit 1',
    '[ -n "${FAKE_SECRET_EMPTY-}" ] && exit 0',
    `printf '%s' '${SCOPED}'`,
  ].join("\n"),
  omp: [
    "{",
    "  printf 'argv'; for a in \"$@\"; do printf ' [%s]' \"$a\"; done; printf '\\n'",
    "  printf 'SHELL=%s\\n' \"${SHELL-unset}\"",
    "  printf 'PERPLEXITY_API_KEY=%s\\n' \"${PERPLEXITY_API_KEY-unset}\"",
    "  printf 'OP_SERVICE_ACCOUNT_TOKEN=%s\\n' \"${OP_SERVICE_ACCOUNT_TOKEN-unset}\"",
    "  env | while IFS= read -r line; do case \"$line\" in OP_*) printf 'env=%s\\n' \"${line%%=*}\";; esac; done",
    "} >> \"$FAKE_LOG/omp.log\"",
    'exit "${FAKE_OMP_EXIT:-0}"',
  ].join("\n"),
};

async function fixture(tools: { op?: boolean; secretTool?: boolean } = {}) {
  const home = await mkdtemp("/tmp/omp-wrapper-");
  homes.push(home);
  const bin = join(home, "bin");
  await mkdir(bin);
  await mkdir(join(home, "logs"));
  await symlink("/usr/bin/id", join(bin, "id"));
  await symlink("/usr/bin/env", join(bin, "env"));
  await symlink(zsh!, join(bin, "zsh"));
  for (const [name, body] of Object.entries(stubs)) {
    if (name === "op" && tools.op === false) continue;
    if (name === "secret-tool" && tools.secretTool === false) continue;
    const path = join(bin, name);
    await writeFile(path, `#!/bin/sh\n${body}\n`);
    await chmod(path, 0o755);
  }
  await writeFile(join(home, "run.zsh"), parentScript);
  return home;
}

function runOmp(home: string, extra: Record<string, string> = {}): OmpRun {
  const r = Bun.spawnSync([zsh!, "-f", join(home, "run.zsh")], {
    env: {
      PATH: join(home, "bin"),
      HOME: home,
      ZDOTDIR: home,
      XDG_CONFIG_HOME: join(home, ".config"),
      SECRETS_FILE: secrets,
      ALIASES_FILE: aliases,
      FAKE_LOG: join(home, "logs"),
      FAKE_UNAME: "Linux",
      OP_SESSION_test: SESSION,
      OP_ACCOUNT: "personal-account",
      OP_CONNECT_TOKEN: "connect-SYNTHETIC",
      OP_SERVICE_ACCOUNT_TOKEN: AMBIENT,
      ...extra,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: r.exitCode ?? -1, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

const log = async (home: string, name: string) =>
  existsSync(join(home, "logs", name)) ? readFile(join(home, "logs", name), "utf8") : "";

afterEach(async () => {
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

describe.skipIf(!zsh)("OMP launcher credential scope", () => {
  test("launches OMP with only the scoped token and leaves the parent shell unchanged", async () => {
    const home = await fixture();
    const r = runOmp(home);
    expect(r.stdout).toContain("exit=0");
    expect(r.stdout).toContain(`parent-session=${SESSION}`);
    expect(r.stdout).toContain(`parent-scoped=${AMBIENT}`);
    expect(r.stdout).toContain("parent-perplexity=unset");

    const child = await log(home, "omp.log");
    expect(child).toContain("argv [--model] [example] [arg with space]");
    expect(child).toContain(`OP_SERVICE_ACCOUNT_TOKEN=${SCOPED}`);
    expect(child).toContain(`PERPLEXITY_API_KEY=${PERPLEXITY}`);
    expect(child).toMatch(/SHELL=.*\/zsh/);
    expect(child.split("\n").filter((line) => line.startsWith("env="))).toEqual([
      "env=OP_SERVICE_ACCOUNT_TOKEN",
    ]);
    expect(child).not.toContain(AMBIENT);
    expect(child).not.toContain(SESSION);

    expect(await log(home, "op.log")).toBe(
      `whoami token=${SCOPED}\nread op://OMP/Perplexity Web Search/password --no-newline token=${SCOPED}\n`,
    );
    expect(await log(home, "secret.log")).toBe(
      `lookup service my-setup.omp.service-account account ${userInfo().username}\n`,
    );
    expect(r.stdout + r.stderr).not.toContain(SCOPED);
    expect(r.stdout + r.stderr).not.toContain(PERPLEXITY);
  });

  test("ignores an inherited PERPLEXITY_API_KEY and reads the vault key once at launch", async () => {
    const home = await fixture();
    const r = runOmp(home, { PERPLEXITY_API_KEY: CALLER });
    expect(r.stdout).toContain("exit=0");
    expect(r.stdout).toContain(`parent-perplexity=${CALLER}`);
    const child = await log(home, "omp.log");
    expect(child).toContain(`PERPLEXITY_API_KEY=${PERPLEXITY}`);
    expect(child).not.toContain(CALLER);
    expect(await log(home, "op.log")).toBe(
      `whoami token=${SCOPED}\nread op://OMP/Perplexity Web Search/password --no-newline token=${SCOPED}\n`,
    );
  });


  test("a failed Perplexity lookup warns without a key and still launches OMP", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_PERPLEXITY_FAIL: "1" });
    expect(r.stdout).toContain("exit=0");
    expect(r.stdout).toContain("parent-perplexity=unset");
    const child = await log(home, "omp.log");
    expect(child).toContain("PERPLEXITY_API_KEY=unset");
    expect(child).toContain(`OP_SERVICE_ACCOUNT_TOKEN=${SCOPED}`);
    expect(r.stderr).toContain("Perplexity web search key unavailable from the OMP vault");
    expect(r.stderr).toContain("isn't an item in the \"OMP\" vault");
    expect(r.stderr).not.toContain(SCOPED);
    expect(r.stderr).not.toContain(AMBIENT);
    expect(r.stderr).not.toContain(SESSION);
  });

  test("propagates OMP's exit status", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_OMP_EXIT: "7" });
    expect(r.stdout).toContain("exit=7");
  });

  test("a missing token store stops the launch before OMP or op runs", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_SECRET_FAIL: "1" });
    expect(r.stdout).toContain("exit=1");
    expect(r.stderr).toContain("OMP did not start");
    expect(r.stderr).not.toContain(AMBIENT);
    expect(await log(home, "omp.log")).toBe("");
    expect(await log(home, "op.log")).toBe("");
  });

  test("an empty token stops the launch before OMP or op runs", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_SECRET_EMPTY: "1" });
    expect(r.stdout).toContain("exit=1");
    expect(r.stderr).toContain("unavailable or empty");
    expect(await log(home, "omp.log")).toBe("");
    expect(await log(home, "op.log")).toBe("");
  });

  test("an invalid stored token stops OMP before credential resolution or MCP startup", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_AUTH_FAIL: "1", PERPLEXITY_API_KEY: CALLER });
    expect(r.stdout).toContain("exit=1");
    expect(r.stdout).toContain(`parent-scoped=${AMBIENT}`);
    expect(r.stdout).toContain(`parent-perplexity=${CALLER}`);
    expect(r.stderr).toContain("stored service-account token cannot authenticate");
    expect(await log(home, "omp.log")).toBe("");
    expect(await log(home, "op.log")).not.toContain("read ");
    expect(r.stdout + r.stderr).not.toContain(SCOPED);
  });

  test("a Linux host without secret-tool stops the launch", async () => {
    const home = await fixture({ secretTool: false });
    const r = runOmp(home);
    expect(r.stdout).toContain("exit=1");
    expect(r.stderr).toContain("secret-tool is required");
    expect(await log(home, "omp.log")).toBe("");
  });

  test("a missing op CLI stops the launch before the credential store is read", async () => {
    const home = await fixture({ op: false });
    const r = runOmp(home);
    expect(r.stdout).toContain("exit=1");
    expect(r.stderr).toContain("1Password CLI (op) is required");
    expect(await log(home, "secret.log")).toBe("");
    expect(await log(home, "omp.log")).toBe("");
  });

  test("an unsupported platform stops the launch", async () => {
    const home = await fixture();
    const r = runOmp(home, { FAKE_UNAME: "FreeBSD" });
    expect(r.stdout).toContain("exit=1");
    expect(r.stderr).toContain("unsupported platform");
    expect(await log(home, "omp.log")).toBe("");
  });

  test("xtrace in the caller does not expose the scoped token", async () => {
    const home = await fixture();
    const r = runOmp(home, { PARENT_XTRACE: "1" });
    expect(r.stdout).toContain("exit=0");
    expect(await log(home, "omp.log")).toContain(`OP_SERVICE_ACCOUNT_TOKEN=${SCOPED}`);
    expect(r.stdout + r.stderr).not.toContain(SCOPED);
    expect(r.stdout + r.stderr).not.toContain(PERPLEXITY);
  });
});
