import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/**
 * A throwaway copy of the parts of the repository a detector skeleton needs (package.json, tsconfig, src, registry,
 * data), with this checkout's node_modules linked in, so a generated skeleton can really be compiled and tested.
 */
export async function scaffoldCheckout(roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-scaffold-"));
  roots.push(root);
  await cp(resolve("src"), join(root, "src"), { recursive: true });
  await cp(resolve("tools/scaffold"), join(root, "tools", "scaffold"), { recursive: true });
  await cp(resolve("registry"), join(root, "registry"), { recursive: true });
  await cp(resolve("data"), join(root, "data"), { recursive: true });
  await cp(resolve("schemas"), join(root, "schemas"), { recursive: true });
  await writeFile(join(root, "package.json"), await readFile(resolve("package.json"), "utf8"));
  const tsconfig = JSON.parse(await readFile(resolve("tsconfig.json"), "utf8")) as { include: string[] };
  tsconfig.include = ["src/**/*.ts", "tests/**/*.ts", "tools/scaffold/**/*.ts"];
  await writeFile(join(root, "tsconfig.json"), JSON.stringify(tsconfig, null, 2));
  await symlink(resolve("node_modules"), join(root, "node_modules"), "dir");
  return root;
}

/** Compiles the checkout with the repository's TypeScript and returns the compiler's output. */
export async function compile(root: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, output: stdout + stderr };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

/** Runs one compiled test file inside the checkout. */
export async function runTest(root: string, file: string): Promise<{ ok: boolean; output: string }> {
  // Inside a test run, node:test would refuse to start a nested run unless this marker is removed.
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  try {
    const { stdout, stderr } = await execute(process.execPath, ["--test", file], { cwd: root, env: environment, maxBuffer: 10 * 1024 * 1024 });
    return { ok: true, output: stdout + stderr };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

export async function removeAll(roots: string[]): Promise<void> {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}
