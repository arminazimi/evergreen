import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Records real `evergreen scan --json` output for the diagnostics mapping test.
// Build the CLI first, then run this from the repository root:
//   npm run build
//   node extensions/vscode/scripts/record-fixtures.mjs
// Only the machine-specific `root` field is normalized; findings, severities,
// locations, and sources are exactly what the CLI printed.

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(extensionRoot, "..", "..");
const fixture = "tests/fixtures/dotnet/positive";
const output = resolve(extensionRoot, "src", "test", "fixtures", "dotnet-positive.json");

const stdout = execFileSync(
  process.execPath,
  ["dist/src/cli.js", "scan", fixture, "--json"],
  { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
);

const scan = JSON.parse(stdout);
scan.root = ".";

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(scan, null, 2)}\n`);
console.log(`${output}: ${scan.findings.length} findings`);
