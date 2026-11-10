#!/usr/bin/env bun
// Runs one tool-less writing pass on the model assigned to omp's writer role and prints the draft.
// usage: bun rewrite.ts <brief.md> [out.md]
// The draft goes to stdout (or out.md); the resolved role and answering model go to stderr.

const WRITER_ROLE = "writer";
const THINKING_LEVELS: Record<string, true> = {
  off: true,
  minimal: true,
  low: true,
  medium: true,
  high: true,
  xhigh: true,
  max: true,
  auto: true,
};
const SYSTEM = [
  "You are a careful technical writer.",
  "Write only from the facts in the brief; never invent facts, names, numbers, paths, or claims.",
  "Return only the requested text, with no preamble or commentary.",
].join(" ");

type WriterModel = {
  role: string;
  provider: string;
  model: string;
  thinking?: string;
};

/** Resolve the writer role through omp itself so config overlays and role changes apply. */
async function resolveWriterModel(): Promise<WriterModel> {
  const config = Bun.spawn(["omp", "config", "get", "modelRoles", "--json"], {
    cwd: process.cwd(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(config.stdout).text(),
    new Response(config.stderr).text(),
    config.exited,
  ]);
  if (code !== 0) {
    console.error(`omp config get modelRoles exited ${code}.\n${stderr.trim()}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.error("omp config get modelRoles returned invalid JSON.");
    process.exit(1);
  }
  if (!parsed || typeof parsed !== "object" || !("value" in parsed)) {
    console.error("omp config get modelRoles returned an unexpected shape.");
    process.exit(1);
  }
  const value = parsed.value;
  if (!value || typeof value !== "object") {
    console.error("omp config get modelRoles returned no role values.");
    process.exit(1);
  }
  const assigned = WRITER_ROLE in value ? value[WRITER_ROLE] : undefined;
  const role = typeof assigned === "string" ? assigned.trim() : "";
  if (!role) {
    console.error(`omp has no "${WRITER_ROLE}" role assigned. Set modelRoles.${WRITER_ROLE} first.`);
    process.exit(1);
  }

  const parts = role.split(":");
  let thinking: string | undefined;
  const suffix = parts[parts.length - 1]!;
  if (parts.length > 1 && THINKING_LEVELS[suffix]) {
    thinking = parts.pop();
  }
  const model = parts.join(":");
  const slash = model.indexOf("/");
  if (slash < 1 || slash === model.length - 1) {
    console.error(`omp resolved modelRoles.${WRITER_ROLE} to "${role}", which is not provider/model[:thinking].`);
    process.exit(1);
  }
  return {
    role,
    provider: model.slice(0, slash),
    model: model.slice(slash + 1),
    thinking,
  };
}

const writer = await resolveWriterModel();

const [briefPath, outPath] = Bun.argv.slice(2);
if (!briefPath) {
  console.error("usage: bun rewrite.ts <brief.md> [out.md]");
  process.exit(2);
}
if (!(await Bun.file(briefPath).exists())) {
  console.error(`brief not found: ${briefPath}`);
  process.exit(2);
}

const modelArgs = ["--model", `${writer.provider}/${writer.model}`];
if (writer.thinking) modelArgs.push("--thinking", writer.thinking);

const run = Bun.spawn(
  [
    "omp", "-p",
    ...modelArgs,
    "--system-prompt", SYSTEM,
    "--no-tools", "--no-session", "--no-skills", "--no-rules", "--no-extensions", "--no-title",
    "--max-time", "300",
    "--mode", "json",
    `@${briefPath}`,
  ],
  { cwd: "/tmp", stdin: "ignore", stdout: "pipe", stderr: "pipe" },
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
console.error(`model: ${reply.provider}/${reply.model} (role ${writer.role})`);
if (reply.provider !== writer.provider || reply.model !== writer.model) {
  console.error(`wrong model: writer role ${writer.role} resolved to ${writer.provider}/${writer.model}, but ${reply.provider}/${reply.model} answered.`);
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
