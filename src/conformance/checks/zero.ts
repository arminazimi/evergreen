import type { ConformanceCheck } from "../index.js";

export const zeroFindingsCheck: ConformanceCheck = {
  guarantee: "zero-finding fixture",
  async run({ detector, fixture }) {
    if (fixture.expectedFindings.length !== 0) {
      throw new Error("the zero-finding check requires a fixture with no expected findings");
    }

    const findings = await detector.scan({ root: fixture.root });
    if (findings.length !== 0) {
      throw new Error(`expected no findings, received ${findings.length}`);
    }
  },
};
