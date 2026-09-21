// `op read` wrappers, matching models.yml's invocation style
// (`apiKey: "!op read \"op://Personal/OMP OPENAI/password\" --no-newline"`).
// Secrets are never hardcoded; both are resolved at runtime via the
// 1Password CLI.

const execFileNode = async (cmd: string, args: string[]): Promise<string> => {
  const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`op read failed (exit ${exitCode}): ${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
};

/** Resolve a single `op://vault/item/field` reference via the op CLI. */
export async function opRead(reference: string): Promise<string> {
  return execFileNode("op", ["read", reference, "--no-newline"]);
}

// The OpenAI key already used by .omp/agent/models.yml for the `openai-api`
// provider. Reused as-is — no new secret created for the rewriter.
const OPENAI_KEY_REF = "op://Personal/OMP OPENAI/password";

// Winston AI API token, vault "Personal", item "gowinston", field
// "password" — confirmed against this account's actual 1Password item.
const WINSTON_KEY_REF = "op://Personal/gowinston/password";

export async function resolveOpenAiKey(): Promise<string> {
  try {
    return await opRead(OPENAI_KEY_REF);
  } catch (err) {
    throw new Error(
      `Could not resolve OpenAI API key via 1Password (${OPENAI_KEY_REF}): ${(err as Error).message}`
    );
  }
}

export async function resolveWinstonKey(): Promise<string> {
  try {
    return await opRead(WINSTON_KEY_REF);
  } catch (err) {
    throw new Error(
      `Could not resolve Winston AI API key via 1Password (${WINSTON_KEY_REF}): ${(err as Error).message}. ` +
        `If <vault-name>/credential is wrong, run "op item get gowinston --format json" and update ` +
        `WINSTON_KEY_REF in lib/secrets.ts with the real vault/field.`
    );
  }
}
