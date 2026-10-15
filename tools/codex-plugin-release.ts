import { mkdir, readFile, rm } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

interface PackageMetadata {
  version: string;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with status ${code ?? "unknown"}`));
    });
  });
}

async function main(): Promise<void> {
  const root = process.cwd();
  const metadata = JSON.parse(
    await readFile(resolve(root, "package.json"), "utf8"),
  ) as PackageMetadata;
  const outputDirectory = resolve(root, "artifacts");
  const output = resolve(
    outputDirectory,
    `evergreen-codex-plugin-${metadata.version}.zip`,
  );

  await mkdir(outputDirectory, { recursive: true });
  await rm(output, { force: true });
  await runCommand(
    "zip",
    ["-X", "-q", "-r", output, ".", "-x", "*.DS_Store"],
    resolve(root, "plugins/codex"),
  );
  process.stdout.write(`Created ${basename(output)}\n`);
}

await main();
