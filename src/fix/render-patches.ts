import type { FilePatch } from "./types.js";

/** The text `fix` prints: the patches back to back, so the output pipes into `git apply`. */
export function renderPatches(patches: FilePatch[]): string {
  return patches.map((patch) => `${patch.diff}\n`).join("");
}
