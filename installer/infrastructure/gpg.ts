interface SecretKey { fingerprint: string; emails: string[] }
/** Usable (not expired/revoked/disabled) signing-capable secret keys, from `--with-colons` output. */
export function parseSecretKeys(colons: string): SecretKey[] {
  const keys: SecretKey[] = [];
  let current: (SecretKey & { usable: boolean; fingerprintSeen: boolean }) | undefined;
  for (const line of colons.split("\n")) {
    const fields = line.split(":");
    if (fields[0] === "sec") {
      if (current?.usable) keys.push({ fingerprint: current.fingerprint, emails: current.emails });
      current = { fingerprint: "", emails: [], usable: !["e", "r", "d", "i"].includes(fields[1] ?? "") && (fields[11] ?? "").includes("S"), fingerprintSeen: false };
    } else if (fields[0] === "fpr" && current && !current.fingerprintSeen) { current.fingerprint = fields[9] ?? ""; current.fingerprintSeen = true; }
    else if (fields[0] === "uid" && current) { const email = /<([^>]+)>/.exec(fields[9] ?? "")?.[1]; if (email) current.emails.push(email.toLowerCase()); }
    else if (fields[0] === "ssb" && current) current.fingerprintSeen = true;
  }
  if (current?.usable) keys.push({ fingerprint: current.fingerprint, emails: current.emails });
  return keys.filter(key => /^[0-9A-F]{40}$/.test(key.fingerprint));
}
