import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const RUST_RELEASES_URL = "https://raw.githubusercontent.com/rust-lang/rust/master/RELEASES.md";

const SOURCES = [
  { title: "Rust security policy", url: "https://www.rust-lang.org/policies/security" },
  { title: "Rust release notes (release dates)", url: "https://github.com/rust-lang/rust/blob/master/RELEASES.md" },
];

interface Release {
  minor: number;
  patch: number;
  date: string;
}

function releases(text: string): Release[] {
  const found: Release[] = [];
  for (const match of text.matchAll(/^Version 1\.(\d+)\.(\d+) \((\d{4}-\d{2}-\d{2})\)\s*$/gm)) {
    if (isIsoDate(match[3])) found.push({ minor: Number(match[1]), patch: Number(match[2]), date: match[3] });
  }
  return found;
}

export const rustToolchainImporter: Importer = {
  id: "rust-1",
  ecosystem: "rust",
  description: "The Rust releases that are no longer supported, from the policy that only the most recent stable release is",
  sources: SOURCES,

  async import(context) {
    const today = isoDate(context.now);
    const notes: string[] = [];
    const all = releases(await context.fetchText(RUST_RELEASES_URL));
    // Only releases that have happened: a heading can carry the date of a release that is still to come.
    const out = all.filter((release) => release.date > today);
    if (out.length > 0) notes.push(`Ignored ${out.length} release heading${out.length === 1 ? "" : "s"} dated after ${today}.`);
    const happened = all.filter((release) => release.date <= today);

    const firsts = new Map<number, string>();
    for (const release of happened) if (release.patch === 0) firsts.set(release.minor, release.date);
    const newest = happened.reduce<Release | undefined>((best, release) => (!best || release.minor > best.minor || (release.minor === best.minor && release.patch > best.patch) ? release : best), undefined);
    const newestMinor = newest?.minor;
    const first = newestMinor === undefined ? undefined : firsts.get(newestMinor);
    if (newest === undefined || newestMinor === undefined || first === undefined || newestMinor < 1) {
      notes.push("No usable Rust release history was found, so nothing was drafted.");
      return { rules: [], notes };
    }
    notes.push(`Newest stable release: 1.${newestMinor}.${newest.patch}.`);

    const rule: DraftRule = {
      id: `rust.toolchain.end-of-support-1.${newestMinor - 1}-and-older`,
      ecosystem: "rust",
      purl: "pkg:generic/rust",
      vers: `vers:semver/<1.${newestMinor}.0`,
      event: "end-of-support",
      title: `Rust 1.${newestMinor - 1} and older are no longer supported`,
      summary: `The Rust project only provides support and security updates for the most recent stable release, so a release line is unsupported once the next stable release ships. Rust 1.${newestMinor} was released on ${first}.`,
      severity: "medium",
      replacement: "The latest stable Rust release",
      deadline: first,
      sources: SOURCES,
    };
    return { rules: [rule], notes };
  },
};
