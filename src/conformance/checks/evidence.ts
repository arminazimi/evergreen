import type { ConformanceCheck } from "../index.js";

export const evidenceCheck: ConformanceCheck = {
  guarantee: "authoritative evidence",
  async run({ detector, fixture }) {
    const findings = await detector.scan({ root: fixture.root });

    for (const finding of findings) {
      const hasSource = finding.sources.some(
        (source) => source.title.trim().length > 0 && source.url.startsWith("https://"),
      );
      if (!hasSource) {
        throw new Error(
          `finding "${finding.id}" does not link an authoritative HTTPS source from its rule`,
        );
      }
    }
  },
};
