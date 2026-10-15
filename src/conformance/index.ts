import { DETECTOR_API_VERSION } from "../sdk.js";
import type { Detector, DetectorFinding } from "../sdk.js";

export const CONFORMANCE_API_VERSION = DETECTOR_API_VERSION;

export interface ConformanceFixture {
  readonly name: string;
  readonly root: string;
  readonly expectedFindings: readonly DetectorFinding[];
}

export interface ConformanceCheckContext {
  readonly detector: Detector;
  readonly fixture: ConformanceFixture;
}

export interface ConformanceCheck {
  readonly guarantee: string;
  run(context: ConformanceCheckContext): Promise<void>;
}

export interface DetectorConformanceOptions {
  readonly detector: Detector;
  readonly fixtures: readonly ConformanceFixture[];
  readonly checks?: readonly ConformanceCheck[];
}

export class ConformanceError extends Error {
  readonly detectorId: string;
  readonly fixtureName: string;
  readonly guarantee: string;

  constructor(detectorId: string, fixtureName: string, guarantee: string, detail: string) {
    super(
      `Detector "${detectorId}" violated the "${guarantee}" guarantee for fixture "${fixtureName}": ${detail}`,
    );
    this.name = "ConformanceError";
    this.detectorId = detectorId;
    this.fixtureName = fixtureName;
    this.guarantee = guarantee;
  }
}

const expectedFindingsCheck: ConformanceCheck = {
  guarantee: "expected findings",
  async run({ detector, fixture }) {
    const findings = await detector.scan({ root: fixture.root });
    const actual = JSON.stringify(findings);
    const expected = JSON.stringify(fixture.expectedFindings);

    if (actual !== expected) {
      throw new Error(`expected ${expected}, received ${actual}`);
    }
  },
};

export async function runDetectorConformance({
  detector,
  fixtures,
  checks = [],
}: DetectorConformanceOptions): Promise<void> {
  if (fixtures.length === 0) {
    throw new ConformanceError(detector.id, "(none)", "fixture coverage", "no fixtures provided");
  }

  for (const fixture of fixtures) {
    for (const check of [expectedFindingsCheck, ...checks]) {
      try {
        await check.run({ detector, fixture });
      } catch (error) {
        if (error instanceof ConformanceError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new ConformanceError(detector.id, fixture.name, check.guarantee, detail);
      }
    }
  }
}
