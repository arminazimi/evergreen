import assert from "node:assert/strict";
import { access, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { materializeExample } from "../tools/examples.js";

const roots: string[] = [];

async function materialize(name: string): Promise<string> {
  const directory = await materializeExample(name);
  roots.push(dirname(directory));
  return directory;
}

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test("an example is materialized with the manifest names scanners read", async () => {
  const directory = await materialize("gallery/php");

  await access(join(directory, "composer.json"));
  await access(join(directory, "composer.lock"));
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.endsWith(".fixture")),
    [],
    "no stored name remains in the materialized copy",
  );
});

test("a Dockerfile example is materialized with its real name", async () => {
  const directory = await materialize("codemods/dockerfile-legacy");

  await access(join(directory, "before.Dockerfile"));
  await access(join(directory, "after.Dockerfile"));
});

test("the whole gallery is materialized at once", async () => {
  const directory = await materialize("gallery");

  await access(join(directory, "kubernetes/expected.json"));
  await access(join(directory, "container/Dockerfile"));
  await access(join(directory, "java/spring-boot/pom.xml"));
});

test("an example outside examples/ is rejected", async () => {
  await assert.rejects(materializeExample("../package.json"), /not an example/);
  await assert.rejects(materializeExample("/etc/passwd"), /not an example/);
});
