export async function resolveOpenAiKey(): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Set OPENAI_API_KEY before running styleguard.");
  return key;
}

export async function resolveWinstonKey(): Promise<string> {
  const key = process.env.WINSTON_API_KEY?.trim();
  if (!key) throw new Error("Set WINSTON_API_KEY before running styleguard.");
  return key;
}
