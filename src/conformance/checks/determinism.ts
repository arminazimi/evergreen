import type { ConformanceCheck } from "../index.js";

export const determinismCheck: ConformanceCheck = {
  guarantee: "deterministic findings",
  async run({ detector, fixture }) {
    const first = JSON.stringify(await detector.scan({ root: fixture.root }));
    const second = JSON.stringify(await detector.scan({ root: fixture.root }));

    if (first !== second) {
      throw new Error("two scans of the same fixture produced different ordered output");
    }
  },
};
