import type { ConformanceCheck } from "../index.js";

export const malformedInputCheck: ConformanceCheck = {
  guarantee: "malformed input safety",
  async run({ detector, fixture }) {
    if (fixture.expectedFindings.length !== 0) {
      throw new Error("malformed fixtures must expect no findings");
    }

    const findings = await detector.scan({ root: fixture.root });
    if (findings.length !== 0) {
      throw new Error(`malformed input produced ${findings.length} findings`);
    }
  },
};
