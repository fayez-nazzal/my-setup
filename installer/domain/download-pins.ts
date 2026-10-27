/**
 * Exact upstream artifacts the installer may install. Each pin fixes the version, the release asset URL, the SHA-256 of
 * the archive bytes, and the archive entries the install needs. Installs never resolve "latest" or fetch checksums.
 */
export interface ArchivePin {
  version: string;
  url: string;
  /** Lowercase hex SHA-256 of the archive file. */
  digest: string;
  /** Entries that must be present in the archive, written without a leading "./". */
  members: readonly string[];
}

/** `${platform}-${architecture}`, matching the host facts the installer reports. */
export type PinKey = `${"darwin" | "linux"}-${"x64" | "arm64"}`;
/** Pins keyed by software id, then by OS and CPU. */
export type DownloadPins = Readonly<Record<string, Readonly<Partial<Record<PinKey, ArchivePin>>> | undefined>>;

/** The pin for one software id on one OS/CPU; undefined means no pin exists and the install must refuse. */
export function pinFor(pins: DownloadPins, id: string, platform: "darwin" | "linux", architecture: "x64" | "arm64"): ArchivePin | undefined {
  return pins[id]?.[`${platform}-${architecture}` as PinKey];
}

const release = (repository: string, tag: string, asset: string) => `https://github.com/${repository}/releases/download/${tag}/${asset}`;
const voltaMacos: ArchivePin = { version: "2.0.2", url: release("volta-cli/volta", "v2.0.2", "volta-2.0.2-macos.tar.gz"), digest: "57f7b51d6fb975f5c48b5ddf68f75103055e19fd822e3e2ce58d2be6ab78977d", members: ["volta", "volta-shim", "volta-migrate"] };
const geistMono: ArchivePin = { version: "3.5.1", url: release("ryanoasis/nerd-fonts", "v3.5.1", "GeistMono.tar.xz"), digest: "d3ba4a7418cde16963fda0caa4f7ae866c509e0a864ec21e393455e1906e070c", members: ["GeistMonoNerdFontMono-Regular.otf", "GeistMonoNerdFontMono-Bold.otf", "GeistMonoNerdFontMono-Italic.otf"] };

export const downloadPins: DownloadPins = {
  bat: {
    "linux-x64": { version: "0.26.1", url: release("sharkdp/bat", "v0.26.1", "bat-v0.26.1-x86_64-unknown-linux-gnu.tar.gz"), digest: "726f04c8f576a7fd18b7634f1bbf2f915c43494c1c0f013baa3287edb0d5a2a3", members: ["bat-v0.26.1-x86_64-unknown-linux-gnu/bat"] },
    "linux-arm64": { version: "0.26.1", url: release("sharkdp/bat", "v0.26.1", "bat-v0.26.1-aarch64-unknown-linux-gnu.tar.gz"), digest: "422eb73e11c854fddd99f5ca8461c2f1d6e6dce0a2a8c3d5daade5ffcb6564aa", members: ["bat-v0.26.1-aarch64-unknown-linux-gnu/bat"] },
  },
  eza: {
    "linux-x64": { version: "0.23.5", url: release("eza-community/eza", "v0.23.5", "eza_x86_64-unknown-linux-gnu.tar.gz"), digest: "35c70c5c43c29108075e58b893234c67ef585f0b53a7eaf8e9e7d4eec9f339b4", members: ["eza"] },
    "linux-arm64": { version: "0.23.5", url: release("eza-community/eza", "v0.23.5", "eza_aarch64-unknown-linux-gnu.tar.gz"), digest: "40b87ae8628aa2ff0f0d2dc24ab52f689631366385c3da630bae745671fd71ec", members: ["eza"] },
  },
  killport: {
    "linux-x64": { version: "2.0.2", url: release("jkfran/killport", "v2.0.2", "killport-x86_64-linux-gnu.tar.gz"), digest: "c65463fe93947ef0f14405a61a1428877801f7aa884db29b71a58b21d83fe80b", members: ["killport-x86_64-linux-gnu/killport"] },
    "linux-arm64": { version: "2.0.2", url: release("jkfran/killport", "v2.0.2", "killport-aarch64-linux-gnu.tar.gz"), digest: "7b2f524dce0a66f452e28c9d74f9ad3173c0a2459626b181357657d96c1608f4", members: ["killport-aarch64-linux-gnu/killport"] },
  },
  starship: {
    "linux-x64": { version: "1.27.0", url: release("starship/starship", "v1.27.0", "starship-x86_64-unknown-linux-musl.tar.gz"), digest: "10c8eb4cb3b761d9bf59ea828444c2dab36c900b7d69a69e08814b286969df89", members: ["starship"] },
    "linux-arm64": { version: "1.27.0", url: release("starship/starship", "v1.27.0", "starship-aarch64-unknown-linux-musl.tar.gz"), digest: "341f5cbf24699fa0b27ec88965ad25f862ea09e15d35a543fd6ffdff1d2aa00d", members: ["starship"] },
  },
  zoxide: {
    "linux-x64": { version: "0.10.0", url: release("ajeetdsouza/zoxide", "v0.10.0", "zoxide-0.10.0-x86_64-unknown-linux-musl.tar.gz"), digest: "2d93385b99f3e82cf2701609a1bffcad863fbeb75aa3fe7eb6be4d29be68b1ae", members: ["zoxide"] },
    "linux-arm64": { version: "0.10.0", url: release("ajeetdsouza/zoxide", "v0.10.0", "zoxide-0.10.0-aarch64-unknown-linux-musl.tar.gz"), digest: "f1f16c5d6298d63dee467eedea1cdcd8490e43e493bea43acd416dc9033ef641", members: ["zoxide"] },
  },
  volta: {
    "linux-x64": { version: "2.0.2", url: release("volta-cli/volta", "v2.0.2", "volta-2.0.2-linux.tar.gz"), digest: "6cec054c911fb925b629a09455775af6e95dc0f5694a4c28b63979ab9ef18037", members: ["volta", "volta-shim", "volta-migrate"] },
    "linux-arm64": { version: "2.0.2", url: release("volta-cli/volta", "v2.0.2", "volta-2.0.2-linux-arm.tar.gz"), digest: "1eb92f8b711753aa576352b2e580b2f3fdadeab8664929ca1da3d0de65448517", members: ["volta", "volta-shim", "volta-migrate"] },
    "darwin-x64": voltaMacos,
    "darwin-arm64": voltaMacos,
  },
  "nerd-font": {
    "linux-x64": geistMono,
    "linux-arm64": geistMono,
    "darwin-x64": geistMono,
    "darwin-arm64": geistMono,
  },
};
