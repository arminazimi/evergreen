import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";

import { readStream, snippetPathFrom } from "../src/commands/check-snippet.js";
import type { CommandContext } from "../src/commands/types.js";

function recordingContext(): { ctx: CommandContext; failures: string[] } {
  const failures: string[] = [];
  const ctx = {
    fail(_kind: string, message: string): number {
      failures.push(message);
      return 2;
    },
  } as unknown as CommandContext;
  return { ctx, failures };
}

test("the snippet path is the value after --path, and --json is allowed", () => {
  const { ctx } = recordingContext();
  assert.equal(snippetPathFrom(["check-snippet", "--path", "Dockerfile", "--json"], ctx), "Dockerfile");
});

test("a missing, valueless, or unknown argument is a usage failure", () => {
  for (const args of [
    ["check-snippet"],
    ["check-snippet", "--path"],
    ["check-snippet", "--path", "--json"],
    ["check-snippet", "--wat"],
  ]) {
    const { ctx, failures } = recordingContext();
    assert.equal(snippetPathFrom(args, ctx), 2, args.join(" "));
    assert.equal(failures.length, 1);
  }
});

test("a stream is read to the end as UTF-8", async () => {
  assert.equal(await readStream(Readable.from([Buffer.from("FROM node:"), Buffer.from("18\n")])), "FROM node:18\n");
  await assert.rejects(
    readStream(
      new Readable({
        read() {
          this.destroy(new Error("boom"));
        },
      }),
    ),
    /boom/,
  );
});
