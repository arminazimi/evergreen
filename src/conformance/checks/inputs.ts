import { declaresInput } from "../../detector-inputs.js";
import type { ConformanceCheck } from "../index.js";
import { traceReads } from "../trace-reads.js";

/**
 * A detector that declares `inputs` may read only the files they name. The check scans the fixture while recording
 * every file opened under its root and fails, naming each one, if a file falls outside the declaration.
 * A detector without `inputs` makes no promise and passes.
 */
export const declaredInputsCheck: ConformanceCheck = {
  guarantee: "declared inputs",
  async run({ detector, fixture }) {
    const inputs = detector.inputs;
    if (!inputs) return;

    const reads = await traceReads(fixture.root, () => detector.scan({ root: fixture.root }));
    const undeclared = reads.filter((path) => !declaresInput(inputs, path));
    if (undeclared.length > 0) {
      throw new Error(`read ${undeclared.map((path) => `"${path}"`).join(", ")}, which its inputs do not declare`);
    }
  },
};
