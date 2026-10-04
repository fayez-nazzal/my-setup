import { describe, expect, test } from "bun:test";
import { parseSecretKeys } from "./gpg";

describe("GPG secret key selection", () => {
  test("keeps usable signing keys with their primary fingerprint and lowercased emails", () => {
    const colons = [
      "sec:u:255:22:D1E86171E1787C29:1759600000:1822672000::u:::scSC:::+:::23::0:",
      "fpr:::::::::79577889B42F74B7EEA98B14D1E86171E1787C29:",
      "grp:::::::::0123456789ABCDEF0123456789ABCDEF01234567:",
      "uid:u::::1759600000::HASH::Fayez Nazzal <Dev@Example.com>::::::::::0:",
      "ssb:u:255:18:AAAAAAAAAAAAAAAA:1759600000::::::e:::+:::cv25519::",
      "fpr:::::::::BBBBBBBBBBBBBBBBBBBBBBBBAAAAAAAAAAAAAAAA:",
    ].join("\n");
    expect(parseSecretKeys(colons)).toEqual([{ fingerprint: "79577889B42F74B7EEA98B14D1E86171E1787C29", emails: ["dev@example.com"] }]);
  });
  test("skips expired, revoked, and encrypt-only keys", () => {
    const key = (validity: string, capabilities: string, fingerprint: string) => [`sec:${validity}:255:22:${fingerprint.slice(-16)}:1:2::u:::${capabilities}:::+:::23::0:`, `fpr:::::::::${fingerprint}:`, "uid:u::::1::H::A <a@example.com>::::::::::0:"].join("\n");
    const colons = [key("e", "scSC", "1".repeat(40)), key("r", "scSC", "2".repeat(40)), key("u", "eE", "3".repeat(40)), key("u", "scSC", "4".repeat(40))].join("\n");
    expect(parseSecretKeys(colons).map(item => item.fingerprint)).toEqual(["4".repeat(40)]);
  });
});
