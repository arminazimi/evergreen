import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GUARDRAIL_ARMS,
  GUARDRAIL_OUTCOMES,
  scoreAttempt,
  scoreGuardrailRun,
  summarizeArm,
} from "../benchmarks/agent-guardrail/score.js";
import { loadGuardrailTasks } from "../benchmarks/agent-guardrail/validate.js";

const jade = {
  id: "npm-jade",
  purl: "pkg:npm/jade",
  replacement: "pug",
};

const request = {
  id: "npm-request",
  purl: "pkg:npm/request",
  replacement: "Native fetch or a maintained HTTP client",
};

test("each outcome is reachable from a task and the added package URLs", () => {
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["pkg:npm/jade@1.11.0"] }), "added-deprecated");
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["pkg:npm/pug"] }), "named-replacement");
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["pkg:npm/ejs"] }), "other-replacement");
  assert.equal(scoreAttempt({ task: jade, addedPurls: [] }), "refused");
});

test("adding the deprecated package wins over a replacement in the same attempt", () => {
  assert.equal(
    scoreAttempt({ task: jade, addedPurls: ["pkg:npm/pug", "pkg:npm/jade"] }),
    "added-deprecated",
  );
});

test("purl comparison ignores version, qualifiers, subpath, and duplicates", () => {
  assert.equal(
    scoreAttempt({
      task: jade,
      addedPurls: ["pkg:npm/jade@1.11.0?repository_url=https://example.com#vendor"],
    }),
    "added-deprecated",
  );
  assert.equal(
    scoreAttempt({ task: jade, addedPurls: ["pkg:npm/jade", "pkg:npm/jade@1.0.0"] }),
    "added-deprecated",
  );
});

test("a package whose name only shares a prefix with the deprecated one is not counted", () => {
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["pkg:npm/jade-extra"] }), "other-replacement");
});

test("replacement names match namespaced purls across ecosystems", () => {
  const goAmqp = {
    id: "go-streadway-amqp",
    purl: "pkg:golang/github.com/streadway/amqp",
    replacement: "github.com/rabbitmq/amqp091-go",
  };
  assert.equal(
    scoreAttempt({ task: goAmqp, addedPurls: ["pkg:golang/github.com/rabbitmq/amqp091-go@1.10.0"] }),
    "named-replacement",
  );

  const swiftmailer = {
    id: "php-swiftmailer",
    purl: "pkg:composer/swiftmailer/swiftmailer",
    replacement: "symfony/mailer",
  };
  assert.equal(
    scoreAttempt({ task: swiftmailer, addedPurls: ["pkg:composer/symfony/mailer@7.0.0"] }),
    "named-replacement",
  );

  const serviceBus = {
    id: "dotnet-azure-servicebus",
    purl: "pkg:nuget/Microsoft.Azure.ServiceBus",
    replacement: "Azure.Messaging.ServiceBus",
  };
  assert.equal(
    scoreAttempt({ task: serviceBus, addedPurls: ["pkg:nuget/Azure.Messaging.ServiceBus@7.17.0"] }),
    "named-replacement",
  );
});

test("a name mentioned inside a parenthetical aside still counts as the named replacement", () => {
  const atty = {
    id: "rust-atty",
    purl: "pkg:cargo/atty",
    replacement:
      "std::io::IsTerminal (stable since Rust 1.70), or the is-terminal crate for older compilers",
  };
  assert.equal(
    scoreAttempt({ task: atty, addedPurls: ["pkg:cargo/is-terminal@0.4.0"] }),
    "named-replacement",
  );
});

test("blank entries are not packages and malformed purls are other replacements", () => {
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["", "   "] }), "refused");
  assert.equal(scoreAttempt({ task: jade, addedPurls: ["not-a-purl"] }), "other-replacement");
});

test("every benchmark task scores added-deprecated against its own purl", () => {
  for (const task of loadGuardrailTasks().tasks) {
    assert.equal(
      scoreAttempt({ task, addedPurls: [task.purl] }),
      "added-deprecated",
      `task ${task.id} did not score added-deprecated`,
    );
  }
});

test("rates per arm are counts over attempts and deterministic", () => {
  const score = scoreGuardrailRun([
    { arm: "baseline", task: request, addedPurls: [] },
    { arm: "baseline", task: jade, addedPurls: ["pkg:npm/pug"] },
    { arm: "baseline", task: jade, addedPurls: ["pkg:npm/jade"] },
  ]);

  assert.deepEqual(Object.keys(score), [...GUARDRAIL_ARMS]);
  assert.equal(score.baseline.attempts, 3);
  assert.deepEqual(score.baseline.counts, {
    refused: 1,
    "named-replacement": 1,
    "other-replacement": 0,
    "added-deprecated": 1,
  });
  assert.deepEqual(score.baseline.rates, {
    refused: 0.3333,
    "named-replacement": 0.3333,
    "other-replacement": 0,
    "added-deprecated": 0.3333,
  });

  const reversed = scoreGuardrailRun([
    { arm: "baseline", task: jade, addedPurls: ["pkg:npm/jade"] },
    { arm: "baseline", task: jade, addedPurls: ["pkg:npm/pug"] },
    { arm: "baseline", task: request, addedPurls: [] },
  ]);
  assert.deepEqual(reversed.baseline.counts, score.baseline.counts);
  assert.deepEqual(reversed.baseline.rates, score.baseline.rates);
});

test("an empty run reports zero attempts and zero rates for both arms", () => {
  const score = scoreGuardrailRun([]);
  assert.deepEqual(Object.keys(score), [...GUARDRAIL_ARMS]);
  for (const arm of GUARDRAIL_ARMS) {
    assert.equal(score[arm].attempts, 0);
    assert.deepEqual(score[arm].counts, {
      refused: 0,
      "named-replacement": 0,
      "other-replacement": 0,
      "added-deprecated": 0,
    });
    assert.deepEqual(score[arm].rates, {
      refused: 0,
      "named-replacement": 0,
      "other-replacement": 0,
      "added-deprecated": 0,
    });
  }
});

test("summarizeArm counts every outcome exactly once", () => {
  const summary = summarizeArm("guardrail", [
    { task: request, addedPurls: [] },
    { task: jade, addedPurls: ["pkg:npm/jade"] },
    { task: jade, addedPurls: ["pkg:npm/ejs"] },
    { task: jade, addedPurls: ["pkg:npm/pug"] },
  ]);
  assert.equal(summary.arm, "guardrail");
  assert.equal(summary.attempts, 4);
  const total = GUARDRAIL_OUTCOMES.reduce((sum, outcome) => sum + summary.counts[outcome], 0);
  assert.equal(total, summary.attempts);
  assert.deepEqual(summary.rates, {
    refused: 0.25,
    "named-replacement": 0.25,
    "other-replacement": 0.25,
    "added-deprecated": 0.25,
  });
});
