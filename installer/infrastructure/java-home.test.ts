import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commands } from "./commands";

const zsh = Bun.which("zsh");
const scratch: string[] = [];
afterEach(async () => { for (const path of scratch.splice(0)) await rm(path, { recursive: true, force: true }); });

async function jdk(path: string, vendor: string, version: string) {
  await mkdir(join(path, "bin"), { recursive: true });
  await writeFile(join(path, "release"), `JAVA_VERSION="${version}"\nIMPLEMENTOR="${vendor}"\n`);
  // The login profile only inspects executable availability and release metadata; no fake Java command is run.
  for (const executable of ["java", "javac"]) { const file = join(path, "bin", executable); await writeFile(file, "#!/bin/sh\nexit 99\n"); await chmod(file, 0o700); }
}

describe.skipIf(!zsh)("Corretto login environment", () => {
  test("Corretto overrides a different vendor and keeps its Java PATH after the profile loader returns", async () => {
    const home = await mkdtemp(join(tmpdir(), "java-profile-")); scratch.push(home);
    const selected = join(home, "Library/Java/JavaVirtualMachines/amazon-corretto-21.jdk/Contents/Home");
    const other = join(home, "other-jdk");
    await jdk(selected, "Amazon.com Inc.", "21.0.12"); await jdk(other, "Other vendor", "21.0.12");
    const root = join(import.meta.dir, "../..");
    await mkdir(join(home, ".config"));
    await symlink(join(root, "zsh/.config/zsh"), join(home, ".config/zsh"));
    await symlink(join(root, "zsh/.zprofile"), join(home, ".zprofile"));
    const result = await commands.run(zsh!, ["-lc", "printf '%s\\n%s' \"$JAVA_HOME\" \"$(command -v java)\""], { quiet: true, env: { HOME: home, ZDOTDIR: home, JAVA_HOME: other, PATH: "/usr/bin:/bin" } });
    expect(result.code).toBe(0);
    expect(result.stdout.split("\n")).toEqual([selected, join(selected, "bin/java")]);
  });
});
