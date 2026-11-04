import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-context-e2e-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

test("builds rule-specific npm migration context from a real repository scan", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ dependencies: { request: "2.88.2" } }),
    "src/client.ts": 'import request from "request";\nrequest.get("https://example.com");\n',
  });
  const result = await scanRepository(root, builtInDetectors);
  const finding = result.findings.find((candidate) => candidate.ruleId === "npm.package.request.deprecated");
  assert.ok(finding);

  const packet = createMigrationPacket(result, finding.id);
  assert.equal(validateMigrationPacket(packet), packet);
  assert.deepEqual(packet.affectedFiles, ["package.json", "src/client.ts"]);
  assert.match(packet.constraints.join("\n"), /timeouts, retries, proxy behavior/);
  assert.deepEqual(
    packet.steps.map((step) => step.id),
    [
      "review-evidence",
      "choose-http-client",
      "replace-request-calls",
      "replace-request-dependency",
      "verify-migration",
    ],
  );
  assert.deepEqual(packet.steps.find((step) => step.id === "replace-request-calls")?.paths, ["src/client.ts"]);
  assert.deepEqual(packet.steps.find((step) => step.id === "replace-request-dependency")?.paths, ["package.json"]);
});

test("builds rule-specific Python migration context with config usages", async () => {
  const root = await repository({
    "requirements.txt": "nose==1.3.7\n",
    "tests/test_legacy.py": "import nose\nnose.run()\n",
    "setup.cfg": "[aliases]\ntest_suite = nose.collector\n",
  });
  const result = await scanRepository(root, builtInDetectors);
  const finding = result.findings.find((candidate) => candidate.ruleId === "python.package.nose.maintenance-only");
  assert.ok(finding);

  const packet = createMigrationPacket(result, finding.id);
  assert.deepEqual(packet.affectedFiles, ["requirements.txt", "setup.cfg", "tests/test_legacy.py"]);
  assert.match(packet.constraints.join("\n"), /Choose one target test runner/);
  assert.deepEqual(packet.steps.find((step) => step.id === "migrate-nose-usages")?.paths, [
    "setup.cfg",
    "tests/test_legacy.py",
  ]);
  assert.ok(packet.verification.some((item) => item.command === "python -m pytest"));
});
