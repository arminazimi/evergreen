import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { githubActionsDetector } from "../src/detectors/github-actions.js";
import { npmDetector } from "../src/detectors/npm.js";
import { pythonDetector } from "../src/detectors/python.js";
import type { Detector } from "../src/sdk.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureDirectory(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-built-in-conformance-"));
  temporaryRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  return root;
}

interface BuiltInFixtures {
  detector: Detector;
  zero: Record<string, string>;
  malformed: Record<string, string>;
}

const builtIns: readonly BuiltInFixtures[] = [
  {
    detector: githubActionsDetector,
    zero: { ".github/workflows/ci.yml": "steps:\n  - uses: actions/checkout@v5\n" },
    malformed: { ".github/workflows/ci.yml": "jobs: [not valid yaml\n  uses: [\n" },
  },
  {
    detector: npmDetector,
    zero: { "package.json": '{"engines":{"node":">=24"}}\n' },
    malformed: {
      "package.json": '{"engines":{"node":">=24"}}\n',
      "yarn.lock": "this is not a valid yarn lock entry\n",
    },
  },
  {
    detector: pythonDetector,
    zero: { "pyproject.toml": '[project]\nrequires-python = ">=3.14"\n' },
    malformed: { "requirements.txt": "%%% not a requirement ???\n" },
  },
];

for (const { detector, zero, malformed } of builtIns) {
  test(`${detector.id} passes detector conformance`, async () => {
    const zeroRoot = await fixtureDirectory(zero);
    await runDetectorConformance({
      detector,
      fixtures: [{ name: `${detector.id} zero findings`, root: zeroRoot, expectedFindings: [] }],
      checks: [determinismCheck, zeroFindingsCheck],
    });

    const malformedRoot = await fixtureDirectory(malformed);
    await runDetectorConformance({
      detector,
      fixtures: [
        { name: `${detector.id} malformed input`, root: malformedRoot, expectedFindings: [] },
      ],
      checks: [malformedInputCheck],
    });
  });
}
