import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { hasSourceFiles, languageFor, maximumFileBytes, sourceFiles } from "../src/source-files.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-source-files-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const absolutePath = join(root, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents);
  }
  return root;
}

test("maps every extension Evergreen reads, case-insensitively", () => {
  assert.deepEqual(["app.js", "app.JSX", "app.mjs", "app.cjs"].map(languageFor), [
    "javascript",
    "javascript",
    "javascript",
    "javascript",
  ]);
  assert.deepEqual(["app.ts", "app.tsx", "app.mts", "app.cts"].map(languageFor), [
    "typescript",
    "typescript",
    "typescript",
    "typescript",
  ]);
  assert.equal(languageFor("cli.py"), "python");
  assert.equal(languageFor("Rakefile.rb"), "ruby");
  assert.equal(languageFor("tasks.rake"), "ruby");
  assert.equal(languageFor("config.INI"), "ini");
  assert.equal(languageFor("compose.YAML"), "yaml");
  assert.equal(languageFor("LICENSE"), undefined);
  assert.equal(languageFor("archive.tar.gz"), undefined);
});

test("walks nested directories and reports repository-relative paths", async () => {
  const root = await repository({
    "src/pkg/deep/module.py": "import urllib\n",
    "other/notes.txt": "not source\n",
    "node_modules/legacy/old.py": "import urllib\n",
  });

  const found = await sourceFiles(root, { include: (language) => language === "python" });
  assert.deepEqual(
    found.map((file) => [file.path, file.language]),
    [["src/pkg/deep/module.py", "python"]],
  );
  assert.equal(found[0]?.absolutePath, join(root, "src/pkg/deep/module.py"));
});

test("reads only the languages the caller asked for", async () => {
  const root = await repository({
    "src/app.ts": 'import request from "request";\n',
    "src/app.py": "import urllib\n",
    "src/app.rb": 'require "active_record"\n',
  });

  const typescript = await sourceFiles(root, { include: (language) => language === "typescript" });
  assert.deepEqual(
    typescript.map((file) => file.path),
    ["src/app.ts"],
  );
  const dynamic = await sourceFiles(root, { include: (language) => language === "python" || language === "ruby" });
  assert.deepEqual(
    dynamic.map((file) => file.path),
    ["src/app.py", "src/app.rb"],
  );
});

test("answers a language probe from the first matching file it finds", async () => {
  const root = await repository({
    "src/pkg/deep/module.py": "import urllib\n",
    "README.md": "# docs\n",
  });

  assert.equal(await hasSourceFiles(root, "python"), true);
  assert.equal(await hasSourceFiles(root, "swift"), false);
});

test("skips files too large to read when probing for a language", async () => {
  const root = await repository({ "README.md": "# docs\n" });

  await writeFile(join(root, "huge.py"), Buffer.alloc(maximumFileBytes + 1, 0x0a));
  assert.equal(await hasSourceFiles(root, "python"), false);
  await writeFile(join(root, "small.py"), "import urllib\n");
  assert.equal(await hasSourceFiles(root, "python"), true);
});
