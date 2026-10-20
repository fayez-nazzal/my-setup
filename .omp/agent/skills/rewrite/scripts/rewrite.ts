#!/usr/bin/env bun
// Runs one tool-less writing pass on Gemini 4 Argon through `omp -p` and prints the draft.
// usage: bun rewrite.ts <brief.md> [out.md]
// The draft goes to stdout (or out.md); the model that answered goes to stderr.

const MODEL = "openrouter/google/gemini-4-argon";
const EXPECTED = { provider: "openrouter", model: "google/gemini-4-argon" };

const SYSTEM = [
  "You are a careful technical writer.",
  "Write only from the facts in the brief; never invent facts, names, numbers, paths, or claims.",
  "Return only the requested text, with no preamble or commentary.",
].join(" ");

const [briefPath, outPath] = Bun.argv.slice(2);
if (!briefPath) {
  console.error("usage: bun rewrite.ts <brief.md> [out.md]");
  process.exit(2);
}
if (!(await Bun.file(briefPath).exists())) {
  console.error(`brief not found: ${briefPath}`);
  process.exit(2);
}

const run = Bun.spawn(
  [
    "omp", "-p",
    "--model", MODEL,
    "--thinking", "high",
    "--system-prompt", SYSTEM,
    "--no-tools", "--no-session", "--no-skills", "--no-rules", "--no-extensions", "--no-title",
    "--mode", "json",
    `@${briefPath}`,
  ],
  { cwd: "/tmp", stdout: "pipe", stderr: "pipe" },
);
const [stdout, stderr, code] = await Promise.all([
  new Response(run.stdout).text(),
  new Response(run.stderr).text(),
  run.exited,
]);

type Message = { role?: string; provider?: string; model?: string; content?: { type: string; text?: string }[]; stopReason?: string; errorMessage?: string };
let reply: Message | undefined;
for (const line of stdout.split("\n")) {
  if (!line.startsWith("{")) continue;
  const event = JSON.parse(line) as { type?: string; message?: Message };
  if (event.type === "message_end" && event.message?.role === "assistant") reply = event.message;
}

if (code !== 0 || !reply) {
  console.error(`omp exited ${code}; no assistant reply.\n${stderr.trim().split("\n").slice(-6).join("\n")}`);
  process.exit(1);
}
console.error(`model: ${reply.provider}/${reply.model}`);
if (reply.provider !== EXPECTED.provider || reply.model !== EXPECTED.model) {
  console.error(`wrong model: expected ${EXPECTED.provider}/${EXPECTED.model}`);
  process.exit(1);
}
if (reply.errorMessage) {
  console.error(`model error: ${reply.errorMessage}`);
  process.exit(1);
}

const text = (reply.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim();
if (!text) {
  console.error("empty draft");
  process.exit(1);
}
if (outPath) await Bun.write(outPath, `${text}\n`);
else process.stdout.write(`${text}\n`);
