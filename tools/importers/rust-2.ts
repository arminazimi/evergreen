import { RUST_CRATE_CANDIDATES } from "./rust-candidates.js";
import type { DraftRule, Importer } from "./types.js";

export const CRATES_INDEX_URL = "https://index.crates.io";

/** The sparse-index path of a crate: `1/a`, `2/ab`, `3/a/abc`, or `ab/cd/abcd…`. */
export function indexPath(name: string): string {
  const lower = name.toLowerCase();
  if (lower.length === 1) return `1/${lower}`;
  if (lower.length === 2) return `2/${lower}`;
  if (lower.length === 3) return `3/${lower[0]}/${lower}`;
  return `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
}

/** Orders versions the way Cargo does for plain releases and pre-releases; exact ties keep their order. */
function compareVersions(left: string, right: string): number {
  const split = (version: string) => {
    const [core = "", pre] = version.split("-", 2);
    return { numbers: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre };
  };
  const a = split(left);
  const b = split(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0);
    if (difference !== 0) return difference;
  }
  if (a.pre === b.pre) return 0;
  if (a.pre === undefined) return 1;
  if (b.pre === undefined) return -1;
  return a.pre < b.pre ? -1 : 1;
}

export const rustYankedImporter: Importer = {
  id: "rust-2",
  ecosystem: "rust",
  description: "Yanked versions of reviewed crates, from the crates.io index that Cargo itself reads",
  sources: [{ title: "crates.io index", url: CRATES_INDEX_URL }],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    for (const name of [...new Set(RUST_CRATE_CANDIDATES)].sort()) {
      const text = await context.fetchText(`${CRATES_INDEX_URL}/${indexPath(name)}`);
      const yanked: string[] = [];
      let total = 0;
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        let entry: { name?: unknown; vers?: unknown; yanked?: unknown };
        try {
          entry = JSON.parse(line) as typeof entry;
        } catch {
          continue;
        }
        if (entry.name !== name || typeof entry.vers !== "string") continue;
        total += 1;
        if (entry.yanked === true) yanked.push(entry.vers);
      }
      if (total === 0) {
        notes.push(`Skipped ${name}: the index has no versions for it.`);
        continue;
      }
      if (yanked.length === 0) {
        notes.push(`${name}: none of its ${total} versions is yanked, so there is nothing to draft.`);
        continue;
      }
      const versions = [...new Set(yanked)].sort(compareVersions);
      rules.push({
        id: `rust.crate.${name.replace(/_/g, "-")}.yanked`,
        ecosystem: "rust",
        purl: `pkg:cargo/${name}`,
        vers: `vers:cargo/${versions.join("|")}`,
        event: "removed",
        title: `${versions.length} version${versions.length === 1 ? "" : "s"} of ${name} ${versions.length === 1 ? "is" : "are"} yanked`,
        summary: `crates.io lists ${versions.length === 1 ? "this version" : "these versions"} of ${name} as yanked: ${versions.join(", ")}. A yanked version has been withdrawn by its maintainers: new projects cannot depend on it, and a lockfile that pins one should move to a version that is not yanked.`,
        severity: "medium",
        replacement: `A version of ${name} that is not yanked`,
        sources: [
          { title: `${name} versions on crates.io`, url: `https://crates.io/crates/${name}/versions` },
          { title: "Cargo: yanking a version", url: "https://doc.rust-lang.org/cargo/commands/cargo-yank.html" },
        ],
      });
    }
    return { rules, notes };
  },
};
