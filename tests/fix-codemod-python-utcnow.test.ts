import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { apply, assertParses, cleanup, normalized, plan as planCodemod } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/python-utcnow");

after(cleanup);

const plan = (files: Record<string, string>) => planCodemod(files, "python-utcnow");

const rows = [
  "from-import-utcnow",
  "from-import-utcfromtimestamp",
  "module-utcnow",
  "module-utcfromtimestamp",
  "alias-utcnow",
  "alias-utcfromtimestamp",
  "timezone-imported",
];

for (const row of rows) {
  test(`${row} is rewritten exactly, parses, and is idempotent`, async () => {
    const before = await readFile(join(fixtures, row, "before.py"), "utf8");
    const expected = await readFile(join(fixtures, row, "after.py"), "utf8");
    const { root, patches, refusals } = await plan({ "app.py": before });

    assert.deepEqual(refusals, []);
    assert.equal(patches.length, 1);
    const fixed = await apply(root, patches[0]!.diff);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed);

    assert.deepEqual((await plan({ "app.py": expected })).patches, []);
  });
}

test("a rewritable call and a refused call in one file produce one patch and one refusal", async () => {
  const before = await readFile(join(fixtures, "mixed", "before.py"), "utf8");
  const expected = await readFile(join(fixtures, "mixed", "after.py"), "utf8");
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  const fixed = await apply(root, patches[0]!.diff);
  assert.equal(fixed, normalized(expected));
  await assertParses(fixed);

  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /takes no arguments/);
  assert.equal(refusals[0]!.line, 4);
});

test("each refused shape is reported and the file is left unchanged", async () => {
  const cases = [
    { file: "star-import.py", reason: /from datetime import \*/ },
    { file: "aliased-import.py", reason: /datetime as d/ },
    { file: "timezone-conflict.py", reason: /bound to something other than `datetime\.timezone`/ },
    { file: "parenthesized-import.py", reason: /parenthesized or spans several lines/ },
    { file: "multiline-import.py", reason: /parenthesized or spans several lines/ },
    { file: "ambiguous.py", reason: /cannot tell which binding a call reads/ },
    { file: "rebinding.py", reason: /not a direct `datetime\.utcnow`/ },
    { file: "arguments.py", reason: /(takes no arguments|timestamp argument|keyword arguments|splat argument)/ },
  ];
  for (const { file, reason } of cases) {
    const { root, patches, refusals } = await plan({
      "app.py": await readFile(join(fixtures, "refusals", file), "utf8"),
    });
    assert.deepEqual(patches, [], `${file} is unchanged`);
    assert.ok(refusals.length > 0, `${file} is refused`);
    assert.ok(
      refusals.some((refusal) => reason.test(refusal.reason)),
      `${file} refusal: ${refusals[0]!.reason}`,
    );
    assert.equal(
      await readFile(join(root, "app.py"), "utf8"),
      await readFile(join(fixtures, "refusals", file), "utf8"),
    );
  }
});

test("every refused argument shape in one file is refused by name", async () => {
  const { refusals } = await plan({ "app.py": await readFile(join(fixtures, "refusals", "arguments.py"), "utf8") });

  assert.equal(refusals.length, 4);
  assert.ok(refusals.some((refusal) => refusal.reason.includes("takes no arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("timestamp argument")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("keyword arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("splat argument")));
});

test("a name bound to timezone in any other way keeps the class import shape from being extended", async () => {
  const bindings = [
    "from zoneinfo import timezone",
    "from zoneinfo import ZoneInfo as timezone",
    "from datetime import tzinfo as timezone",
    "import zoneinfo as timezone",
    "timezone = None",
    "timezone += 1",
    "def timezone():\n    pass",
    "class timezone:\n    pass",
    "def read(timezone):\n    pass",
    "def read(*timezone):\n    pass",
    "read = lambda timezone: timezone",
    "with open(path) as timezone:\n    pass",
    "for timezone in items:\n    pass",
    "if (timezone := 1):\n    pass",
    "def read():\n    global timezone",
    "def read():\n    nonlocal timezone",
  ];
  for (const binding of bindings) {
    const source = `from datetime import datetime\n\n${binding}\n\nvalue = datetime.utcnow()\n`;
    const { patches, refusals } = await plan({ "app.py": source });
    assert.deepEqual(patches, [], `${binding} is unchanged`);
    assert.equal(refusals.length, 1, `${binding} is refused`);
    assert.match(refusals[0]!.reason, /already bound to something other than `datetime\.timezone`/, binding);
  }
});
