import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { javaDetector } from "../src/detectors/java/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { isUsageMatcher } from "../src/sdk.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-java-usage-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

const contract = [
  {
    id: "driver",
    matchers: [
      { kind: "import" as const, language: "java" as const, module: "com.mysql" },
      { kind: "import" as const, language: "kotlin" as const, module: "com.mysql" },
    ],
  },
];

test("reports Java imports, static imports, and wildcards with exact lines", async () => {
  const root = await repository({
    "src/main/java/App.java": [
      "package app;",
      "",
      "import com.mysql.jdbc.Driver;",
      "import static com.mysql.cj.util.StringUtils.isNullOrEmpty;",
      "import com.mysql.cj.jdbc.*;",
      "import java.util.List;",
      "import com.mysqlx.Other;",
      "",
      "class App {}",
    ].join("\n"),
  });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(analysis!.usages.map((usage) => [usage.location.path, usage.location.line, usage.location.column, usage.excerpt]), [
    ["src/main/java/App.java", 3, 8, "import com.mysql.jdbc.Driver;"],
    ["src/main/java/App.java", 4, 15, "import static com.mysql.cj.util.StringUtils.isNullOrEmpty;"],
    ["src/main/java/App.java", 5, 8, "import com.mysql.cj.jdbc.*;"],
  ]);
  assert.deepEqual(analysis!.impact, { usageCount: 3, affectedFiles: 1, level: "low" });
});

test("reports Kotlin imports with and without an alias", async () => {
  const root = await repository({
    "src/App.kt": "package app\n\nimport com.mysql.cj.jdbc.Driver as MySql\nimport com.mysql.jdbc.*\nimport kotlin.io.println\n",
  });
  const [analysis] = await analyzeSourceUsage(root, contract);
  assert.deepEqual(analysis!.usages.map((usage) => [usage.language, usage.location.line]), [["kotlin", 3], ["kotlin", 4]]);
});

test("ignores commented imports, strings, and other languages", async () => {
  const root = await repository({
    "A.java": [
      "// import com.mysql.jdbc.Driver;",
      "/* import com.mysql.jdbc.Driver;",
      "import com.mysql.jdbc.Driver; */",
      'class A { String s = "import com.mysql.jdbc.Driver;"; }',
    ].join("\n"),
    "notes.txt": "import com.mysql.jdbc.Driver;\n",
    "B.kt": "val text = \"import com.mysql.jdbc.Driver\"\n",
  });
  assert.deepEqual((await analyzeSourceUsage(root, contract))[0]!.usages, []);
});

test("a java matcher does not match Kotlin files, and the reverse", async () => {
  const root = await repository({ "A.java": "import com.mysql.Driver;\n", "B.kt": "import com.mysql.Driver\n" });
  const [java] = await analyzeSourceUsage(root, [{ id: "j", matchers: [{ kind: "import", language: "java", module: "com.mysql" }] }]);
  const [kotlin] = await analyzeSourceUsage(root, [{ id: "k", matchers: [{ kind: "import", language: "kotlin", module: "com.mysql" }] }]);
  assert.deepEqual(java!.usages.map((usage) => usage.location.path), ["A.java"]);
  assert.deepEqual(kotlin!.usages.map((usage) => usage.location.path), ["B.kt"]);
});

test("the usage matcher guard accepts java and kotlin imports but not calls", () => {
  assert.equal(isUsageMatcher({ kind: "import", language: "java", module: "com.mysql" }), true);
  assert.equal(isUsageMatcher({ kind: "import", language: "kotlin", module: "com.mysql" }), true);
  assert.equal(isUsageMatcher({ kind: "call", language: "java", module: "com.mysql", targets: ["x"] }), false);
});

test("a moved dependency's finding lists the files that import it, in a migration packet", async () => {
  const root = await repository({
    "pom.xml": "<project><dependencies><dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId><version>8.0.33</version></dependency></dependencies></project>",
    "src/main/java/Db.java": "import com.mysql.cj.jdbc.Driver;\n\nclass Db {}\n",
    "src/main/kotlin/Db.kt": "import com.mysql.jdbc.Driver\n",
  });
  const result = await scanRepository(root, [javaDetector]);
  const finding = result.findings.find((item) => item.ruleId === "java.maven.mysql.mysql-connector-java.relocated");
  assert.ok(finding);
  assert.deepEqual(finding.usages?.map((usage) => usage.location.path), ["src/main/java/Db.java", "src/main/kotlin/Db.kt"]);
  assert.equal(finding.impact?.level, "low");
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("pom.xml"));
  assert.ok(packet.affectedFiles.includes("src/main/java/Db.java"));
});

test("a JDK finding has no usages", async () => {
  const root = await repository({ ".java-version": "22\n", "A.java": "import com.mysql.Driver;\n" });
  const [finding] = await javaDetector.scan({ root });
  assert.ok(finding);
  assert.equal((finding as { usages?: unknown }).usages, undefined);
});
