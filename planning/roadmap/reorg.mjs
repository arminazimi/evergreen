// Moves the open roadmap issues into the outcome-based phases P26–P37 and the
// v0.8.0 / v0.9.0 releases that come before v1.
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
  P29: [305],
  P30: [284, 304],
  P32: [62],
  P33: [36, 33, 254, 255, 256, 257, 285, 306, 307],
  P34: [82, 273],
  P36: [78, 235, 236, 237, 238, 239, 240, 241, 261, 263],
  P37: [57, 84, 274, 275, 276, 277, 278, 308, 309, 310, 312],
  V08: [75, 30, 31, 1117, 1118, 1172, 83, 286, 290, 292, 293, 311, 1069],
  V09: [
    85, 288, 289, 295, 296, 297, 298, 299, 313, 314, 315, 317, 318, 1071, 1072,
    58, 59, 264, 265, 266, 267, 268, 269, 270, 300, 1070, 1074,
    81, 258, 259, 260, 262, 1067, 1073,
    79, 242, 243, 244, 245, 316, 1068,
  ],
};

// Open issue number → new epic, for tasks that move to a different epic.
const EPIC_OF = {
  311: "E-v08-scorecards",
  1069: "E-v08-pilots",
  288: "E-launch", 289: "E-launch", 295: "E-launch", 296: "E-launch", 298: "E-launch", 299: "E-launch",
  59: "E-v09-metrics", 270: "E-v09-metrics", 300: "E-v09-metrics", 1070: "E-v09-metrics",
  1074: "E-v09-first-issues",
  1067: "E-open-data", 1073: "E-open-data",
  262: "E-v09-presence", 297: "E-v09-presence", 317: "E-v09-presence", 318: "E-v09-presence",
  316: "E-agent-bench", 1068: "E-agent-bench",
};

// Roadmap key → { month, epic? }, for issues the generator owns.
export const REASSIGN = {};
// Issue number → new phase, for issues created outside the generator (milestone only).
export const EXTERNAL = {};
for (const [month, list] of Object.entries(PHASE_OF)) {
  for (const n of list) {
    const key = keyOf.get(n);
    if (key) REASSIGN[key] = { month, ...(EPIC_OF[n] && { epic: EPIC_OF[n] }) };
    else EXTERNAL[n] = month;
  }
}

// Phases whose open issues all moved; they are closed once empty.
export const CLOSE_WHEN_EMPTY = ["M3", "M4", "M5", "M6", "P38", "P39", "P40"];

export const reassign = (items) => items.map((item) => (REASSIGN[item.key] ? { ...item, ...REASSIGN[item.key] } : item));
