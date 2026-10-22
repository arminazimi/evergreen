// Moves the open roadmap issues into the outcome-based phases P26–P40.
// Closed issues keep their original phase, so Phases 22–25 stay as history.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const statePath = join(here, "out", "state.json");
const numbers = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")).numbers ?? {} : {};
const keyOf = new Map(Object.entries(numbers).map(([key, n]) => [n, key]));

// Open issue numbers by destination phase.
const PHASE_OF = {
  P27: [740, 727, 728, 846, 845, 827, 641, 137, 138, 139, 141, 142, 41],
  P28: [738, 638, 773, 932, 69, 80, 249, 251, 252, 253],
  P29: [75, 30, 31, 305],
  P30: [284, 304],
  P32: [62],
  P33: [36, 33, 254, 255, 256, 257, 285, 286, 290, 292, 293, 306, 307, 83],
  P34: [82, 273],
  P36: [78, 235, 236, 237, 238, 239, 240, 241, 261, 263],
  P37: [57, 84, 59, 274, 275, 276, 277, 278, 308, 309, 310, 311, 312],
  P38: [79, 242, 243, 244, 245, 316],
  P39: [85, 288, 289, 295, 296, 297, 298, 299, 300, 270, 313, 314, 315, 317, 318],
  P40: [58, 81, 264, 265, 266, 267, 268, 269, 258, 259, 260, 262],
};

// Roadmap key → new phase, for issues the generator owns.
export const REASSIGN = {};
// Issue number → new phase, for issues created outside the generator (milestone only).
export const EXTERNAL = {};
for (const [month, list] of Object.entries(PHASE_OF)) {
  for (const n of list) {
    const key = keyOf.get(n);
    if (key) REASSIGN[key] = month;
    else EXTERNAL[n] = month;
  }
}

// Phases whose open issues all moved; they are closed once empty.
export const CLOSE_WHEN_EMPTY = ["M3", "M4", "M5", "M6"];

export const reassign = (items) => items.map((item) => (REASSIGN[item.key] ? { ...item, month: REASSIGN[item.key] } : item));
