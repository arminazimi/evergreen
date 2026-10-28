// Agent-native epics for v0.8.0 and v0.9.0: lifecycle at a glance, the Evergreen/Slipway/Seaworthy toolchain,
// verification receipts, parallel migration plans, and public proof for the guardrail and the plan.
// Every task names the files it owns so tasks in one epic can run in parallel. Written 2026-10-28.

const CHECK = "`npm run check` passes.";

function epic(key, month, title, areas, goal, scope, exit) {
  return { key, kind: "epic", month, title: `Epic: ${title}`, areas, goal, scope, exit };
}
function t(epicKey, month, key, title, lane, size, types, areas, goal, files, steps, done, deps = [], opts = {}) {
  return { epic: epicKey, month, key, title, lane, size, types, areas, goal, files, steps, done: [...done, CHECK], deps, ...opts };
}
const DONT = [
  "Do not expand scope beyond this issue; open a follow-up instead.",
  "Do not add network access to scans.",
  "Do not edit generated files by hand (dist/action/index.js, plugins/, docs/rules/, docs/ROADMAP.md, docs/llms-full.txt).",
  "Do not add a dependency without stating why in the pull request.",
];

export const EPICS_AGENT = [
  epic("E-v08-glance", "V08", "Lifecycle at a glance", ["area: core","area: docs"],
    "Anyone sees what reaches end of life next as a timeline in the terminal and in a report they can send, with one command and no setup.",
    [
      "A terminal timeline for `evergreen forecast`",
      "An inline-SVG forecast inside the HTML report",
      "A polished, self-contained HTML report",
      "A `forecast_repository` MCP tool so agents can plan ahead",
      "A recorded demo",
    ],
    [
      "`evergreen forecast --timeline` and `evergreen scan --format html` both show the next twelve months, and the demo is recorded from a tape file.",
    ]),
  epic("E-v08-toolchain", "V08", "Evergreen, Slipway, and Seaworthy as one toolchain", ["area: devops","area: integration"],
    "A site built on Slipway runs Evergreen for dependency lifecycle and Seaworthy for site verification from one documented setup, and tests prove the Evergreen half works on repositories shaped like theirs.",
    [
      "Fixtures shaped like the Slipway site and the Seaworthy monorepo",
      "A combined CI workflow and an agent guide for the three tools",
      "A Slipway starter and `evergreen init` detection",
      "Companion issues in the Slipway and Seaworthy repositories",
      "Constraint: Slipway is in planning and Seaworthy is pre-alpha, so nothing here may require either to be installable. Everything that needs them is gated or marked blocked.",
    ],
    [
      "Evergreen's side of the integration is tested against Slipway-shaped and Seaworthy-shaped repositories, and the combined workflow is ready to switch on when Seaworthy ships.",
    ]),
  epic("E-v09-receipts", "V09", "Verification receipts for agent pull requests", ["area: agent","area: core"],
    "An agent's migration pull request carries a short, reproducible receipt: which findings the change resolved, what remains, what it introduced, and which checks to run.",
    [
      "An `evergreen.receipt.v1` contract built on the existing before/after comparison",
      "A Markdown renderer for pull request bodies",
      "An `evergreen receipt` command, a `verify_migration` receipt, and a \"resolved by this pull request\" section in the Action comment",
      "Agent instructions that ask for the receipt",
    ],
    [
      "An agent following the migration prompt ends with a pull request body that contains a receipt a reviewer can reproduce with one command.",
    ]),
  epic("E-v09-plan", "V09", "Parallel migration plans for agents", ["area: agent","area: core"],
    "Evergreen turns a scan into waves of independent migration tasks, so many agents can work at once without editing the same files.",
    [
      "An `evergreen.plan.v1` contract",
      "Touch sets per finding and conflict-free waves",
      "An `evergreen plan` command and a `plan_migrations` MCP tool",
      "A dispatch example that prints, and never runs, one worktree command per task",
    ],
    [
      "On a monorepo fixture, `evergreen plan --json` returns waves whose tasks touch pairwise disjoint files.",
    ]),
  epic("E-v09-proof", "V09", "Public proof for the guardrail and the parallel plan", ["area: validation","area: agent"],
    "Published numbers show that agents with Evergreen's dependency guardrail add fewer deprecated packages, and that wave-parallel plans finish sooner than sequential work.",
    [
      "Complements #79: that epic measures migration packets; this one measures the guardrail and the plan",
      "Reuses the harness adapters from #243",
      "Offline fake adapters in CI, so tests never need an API key",
      "Real runs and publication stay with the maintainer",
    ],
    [
      "Results for both arms are published with methodology, across at least two agents.",
    ]),
];

export const TASKS_AGENT = [
  t("E-v08-glance", "V08", "glance.timeline-text", "Render the forecast as a terminal timeline", "free", "S", ["type: task"], ["area: core","area: docs"],
    "Show what reaches end of life next as bars on a month axis, so the answer is visible at a glance.",
    [
      "src/forecast-timeline.ts (new)",
      "tests/forecast-timeline.test.ts (new)",
    ],
    [
      "Read `src/forecast.ts`. Reuse the object `buildForecast` returns and its `ForecastEvent` type; do not change either.",
      "Export `renderForecastTimeline(forecast, options?: { width?: number; color?: boolean }): string`. One row per month in the window, a bar scaled to the number of events, and a marker plus the finding count when an event hits the scanned repository.",
      "Default width 80. With `color: false` use plain ASCII only. Never read the clock, the locale, or the terminal: everything comes from arguments.",
      "Show a clear one-line message for an empty forecast.",
      "Cover a populated forecast, an empty one, a very narrow width, and a month with many events. Use fixed input objects and compare exact strings.",
    ],
    [
      "`renderForecastTimeline` output is byte-identical across runs and platforms.",
      "Tests cover populated, empty, and narrow cases.",
    ],
    [], { dont: [...["Do not edit `src/cli-main.ts`; `glance.timeline-cli` wires the flag.","Do not add a color or table library."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.timeline-cli", "Add `evergreen forecast --timeline`", "strong", "S", ["type: task"], ["area: core","area: docs"],
    "Let anyone see the timeline with one flag.",
    [
      "src/cli-main.ts (the forecast usage line and the forecast command block only)",
      "src/completions.ts (only if it lists per-command flags)",
      "tests/forecast-timeline-cli.test.ts (new)",
    ],
    [
      "Add `--timeline` to `evergreen forecast`, rendering with `renderForecastTimeline`. It is mutually exclusive with `--json`; return the existing usage error shape when both are given.",
      "Use `process.stdout.isTTY` and `NO_COLOR` to choose `color`, and the terminal width capped at 100.",
      "Update the usage text and shell completions so their tests still pass.",
      "Test through the built CLI, as `tests/forecast.test.ts` does: text output with `--as-of`, the conflict with `--json`, and `NO_COLOR`.",
    ],
    [
      "`evergreen forecast --timeline` works and is covered by CLI tests.",
      "Default `forecast` output is unchanged.",
    ],
    ["glance.timeline-text"], { dont: [...["Do not change the default `forecast` text or JSON output.","Do not change exit codes (see `docs/decisions/0016-cli-exit-codes.md`)."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.forecast-svg", "Render the forecast as an inline SVG", "free", "S", ["type: task"], ["area: core","area: docs"],
    "Give the HTML report a chart that works without JavaScript or network access.",
    [
      "src/forecast-svg.ts (new)",
      "tests/forecast-svg.test.ts (new)",
    ],
    [
      "Export `renderForecastSvg(forecast, options?: { width?: number }): string` returning one self-contained `<svg>` element: a month axis, one marker per event, and a larger marker when the event affects the scanned repository.",
      "Style with CSS custom properties and `prefers-color-scheme` so it reads in light and dark. No script, no external references, no fonts.",
      "Add `role=\"img\"`, a `<title>`, and a `<desc>` that lists the events in words for screen readers.",
      "Escape every string from the registry. Add a test with `<script>` and quotes in a rule title.",
      "The report page sets `default-src 'none'; style-src 'unsafe-inline'`; the SVG must work under exactly that policy.",
    ],
    [
      "Output is deterministic and escaped.",
      "Tests cover populated, empty, and hostile-title input.",
    ],
    [], { dont: [...["Do not edit `src/reporters.ts`; `glance.html-forecast` wires it in.","Do not use `Date.now` or the locale."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.html-polish", "Polish the HTML report so it is worth sending", "strong", "M", ["type: task"], ["area: core","area: docs"],
    "Make `evergreen scan --format html` a report a manager can read in one minute.",
    [
      "src/reporters.ts (renderHtml, HTML_STYLE, and helpers only)",
      "tests/html-report.test.ts",
    ],
    [
      "Read `renderHtml` and the existing tests first.",
      "Add a summary row with counts per severity, then group findings by severity and then by path.",
      "Show each finding's rule, evidence source (an `https` link with `rel=\"noopener noreferrer\"`; render anything else as plain text), replacement, and exact location.",
      "Add `prefers-color-scheme` dark styles and a print stylesheet. No JavaScript.",
      "Keep the embedded `evergreen-report` JSON block and the Content-Security-Policy meta tag exactly as they are; the page must still read back to the same JSON report.",
    ],
    [
      "The HTML report shows a severity summary and grouped findings.",
      "Existing HTML tests pass and new tests cover grouping and unsafe links.",
    ],
    [], { dont: [...["Do not change any other reporter.","Do not add scripts, external fonts, or images."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.html-forecast", "Show the next twelve months in the HTML report", "strong", "S", ["type: task"], ["area: core","area: docs"],
    "Put the forecast chart into the report so one file answers \"what is about to break\".",
    [
      "src/reporters.ts (add an optional second argument to renderHtml)",
      "src/cli-main.ts (the --format html branch of scan only)",
      "tests/html-report.test.ts",
    ],
    [
      "Change the signature to `renderHtml(result, options?: { forecast?: Forecast })`. Without `options` the output must stay unchanged.",
      "In the CLI, build the forecast with `buildForecast` from the bundled rules and `DEFAULT_FORECAST_MONTHS`, as the `forecast` command does, and pass it in. This must not use the network.",
      "Render a \"Next 12 months\" section with `renderForecastSvg` above the findings, and a text list of the same events below it for readers without SVG.",
      "Test that the section appears, that it is absent when no forecast is passed, and that the JSON block is unchanged.",
    ],
    [
      "`scan --format html` contains the forecast section.",
      "Output without a forecast is byte-identical to before.",
    ],
    ["glance.forecast-svg","glance.html-polish"], { dont: [...["Do not make `scan` slower when the format is not `html`.","Do not add a new flag."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.mcp-forecast", "Add a `forecast_repository` MCP tool", "strong", "S", ["type: task"], ["area: core","area: docs"],
    "Let an agent ask what reaches end of life next, so it can plan ahead.",
    [
      "src/mcp.ts (tool list, schema map, handler)",
      "schemas/forecast.v1.schema.json (new)",
      "docs/MCP.md (one table row and a short section)",
      "tests/mcp-forecast.test.ts (new)",
    ],
    [
      "Follow how an existing read-only tool such as `scan_repository` is declared in `src/mcp.ts`, including its output schema.",
      "Input: `repository_path`, optional `months` (default and maximum from `src/forecast.ts`), optional `as_of`. Output: the same object `evergreen forecast --json` prints.",
      "Mark it read-only. `tests/mcp-readonly.test.ts` and `tests/capabilities.test.ts` show what must stay true; update what they require.",
      "Tool shapes are public contracts and change only additively.",
    ],
    [
      "The tool is listed, read-only, and validates against its schema.",
      "`npm run check` passes.",
    ],
    [], { dont: [...["Do not change the shape of any existing tool.","Do not add network access."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.share-docs", "Document how to share a lifecycle report", "free", "S", ["type: docs"], ["area: core","area: docs"],
    "Tell people how to produce the timeline and the HTML report and what is safe to send.",
    [
      "docs/SHARE_REPORT.md (new)",
      "docs/llms.txt (one link)",
      "docs/llms-full.txt (generated)",
    ],
    [
      "Write the page with real commands and output copied from a run: `forecast --timeline`, `scan --format html > report.html`.",
      "State what the report contains (paths, finding titles, source links) and that nothing is uploaded anywhere.",
      "Add one link in `docs/llms.txt`, then run `npm run build:llms`; never edit `docs/llms-full.txt` by hand.",
    ],
    [
      "The page exists, is linked, and `npm run build:llms` leaves no drift.",
    ],
    ["glance.timeline-cli","glance.html-forecast"], { dont: [...["Do not edit `README.md`; the README rewrite owns it.","Do not invent output; copy it from a real run."], ...DONT] }),
  t("E-v08-glance", "V08", "glance.demo", "Record a demo of the forecast timeline and the HTML report", "free", "S", ["type: docs"], ["area: core","area: docs"],
    "Show the two most visual commands in a short recording that is regenerated from source.",
    [
      "demos/forecast.tape",
      "docs/assets/demos/",
    ],
    [
      "Follow the tape-file conventions from the demo recordings that already exist (#1252, #1253).",
      "Script: `scan` on `examples/demo`, `forecast --timeline`, then open the HTML report path.",
      "The recording must be reproducible without network access or an API key.",
    ],
    [
      "The recording regenerates from the tape in CI.",
      "The recording is under 30 seconds.",
    ],
    ["readme.tapes","glance.timeline-cli","glance.html-forecast"], { dont: [...["Do not hand-edit the recording output; it is generated."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.fixture-slipway", "Add a Slipway-shaped site fixture and scan test", "free", "S", ["type: fixture"], ["area: devops","area: integration"],
    "Prove Evergreen handles a Jekyll and GitHub Pages site of the kind Slipway ships.",
    [
      "tests/fixtures/toolchain/slipway-site/ (new)",
      "tests/toolchain-slipway.test.ts (new)",
    ],
    [
      "Create a small site: `Gemfile`, `Gemfile.lock`, `_config.yml`, one Markdown page, and `.github/workflows/pages.yml` that builds and deploys to GitHub Pages. Look at the Slipway repository's `Gemfile` and `.github/workflows/ci.yml` for the shape; copy none of its content.",
      "Run `npm run dev -- scan tests/fixtures/toolchain/slipway-site --json`. Pin the Ruby gems and the Actions versions so the current registry produces a stable result.",
      "The test scans the fixture and asserts the exact findings (detector, rule, path, line). If the Ruby detector emits nothing for this shape, assert that and say so in the pull request: zero findings is a valid case.",
    ],
    [
      "The test is deterministic and does not use the network.",
    ],
    [], { dont: [...["Do not add registry rules here.","Do not make claims about Jekyll or gem lifecycle; assert only what the scan reports."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.fixture-seaworthy", "Add a Seaworthy-shaped monorepo fixture and scan test", "free", "S", ["type: fixture"], ["area: devops","area: integration"],
    "Prove monorepo discovery works on an npm workspaces repository with several packages and an Action.",
    [
      "tests/fixtures/toolchain/seaworthy-monorepo/ (new)",
      "tests/toolchain-seaworthy.test.ts (new)",
    ],
    [
      "Create a root `package.json` with `workspaces`, three packages named `verify`, `action`, and `mcp` under `packages/`, a `package-lock.json`, an `action.yml` with a Node runtime, and a CI workflow. Look at the Seaworthy repository's layout for the shape; copy none of its content.",
      "Run `npm run dev -- scan <fixture> --json` and pin versions so the result is stable.",
      "Assert that every finding's path is relative and names the right package, and that the output is identical across two runs.",
    ],
    [
      "The test is deterministic and does not use the network.",
    ],
    [], { dont: [...["Do not run `npm install` in the fixture.","Do not add registry rules here."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.workflow", "Add a combined Evergreen and Seaworthy CI workflow", "strong", "S", ["type: task"], ["area: devops","area: integration"],
    "Give a Slipway site one workflow that checks dependency lifecycle and verifies the built site.",
    [
      "integrations/slipway-seaworthy/evergreen-seaworthy.yml (new)",
      "integrations/slipway-seaworthy/README.md (new)",
      "tests/site-stack-workflow.test.ts (new)",
    ],
    [
      "Job one runs the Evergreen Action the way `docs/GITHUB_ACTION.md` shows. Job two builds the site and runs `npx seaworthy verify ./_site`.",
      "Seaworthy is pre-alpha and not on npm. Gate job two on a repository variable `SEAWORTHY_ENABLED == 'true'` and explain in the README how to switch it on once Seaworthy publishes.",
      "Pin every action the way the existing workflows in this repository do. Before adding any action, run `npm run dev -- check pkg:github/<owner>/<repo>@<ref>` and do not add one that reports end of life.",
      "Test by parsing the YAML with the helper the other workflow tests use (see `tests/ci-snippets.test.ts`): both jobs exist, job two is gated, and no step uses an unpinned reference.",
    ],
    [
      "The workflow parses, is gated, and is documented.",
      "`npm run check` passes.",
    ],
    [], { dont: [...["Do not add network access to tests.","Do not require Seaworthy to be installed anywhere in `npm run check`."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.agents-guide", "Write the agent guide for the Evergreen, Slipway, and Seaworthy loop", "free", "S", ["type: docs"], ["area: devops","area: integration"],
    "Tell an agent editing a Slipway site when to call each tool.",
    [
      "docs/SITE_STACK.md (new)",
      "examples/agents/site-stack/AGENTS.md (new)",
      "docs/llms.txt (one link)",
      "tests/site-stack-docs.test.ts (new)",
    ],
    [
      "Write the loop: before adding a gem or package, `evergreen check`; after editing pages, `seaworthy verify ./_site`; which output to trust for what. Mark Seaworthy commands as pending its first release.",
      "Add a sample `AGENTS.md` that a Slipway site can copy.",
      "The test asserts that the sample mentions both tools and that every `evergreen` subcommand in it appears in the CLI usage text, so the guide cannot drift.",
      "Add one link in `docs/llms.txt` and run `npm run build:llms`.",
    ],
    [
      "The guide and sample exist and the drift test passes.",
    ],
    [], { dont: [...["Do not claim Seaworthy or Slipway features that are not released.","Do not edit generated files by hand."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.starter", "Add a Slipway starter configuration", "free", "S", ["type: task"], ["area: devops","area: integration"],
    "Give a Slipway site a ready Evergreen configuration and workflow to copy.",
    [
      "examples/starters/slipway/ (new)",
      "tests/starters-slipway.test.ts (new)",
    ],
    [
      "Read `examples/starters/nextjs/` and its test first, and mirror the layout.",
      "Include an Evergreen config, a workflow, and a short README.",
      "The test loads the config with the real config loader and runs a scan of `tests/fixtures/toolchain/slipway-site` if it exists, otherwise of a tiny inline fixture. It must not depend on the other fixture task being merged.",
    ],
    [
      "The starter validates against the config schema and its test passes.",
    ],
    [], { dont: [...["Do not change `src/config.ts`.","Do not add a dependency."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.init-detect", "Detect a Jekyll or Slipway site in `evergreen init`", "strong", "M", ["type: task"], ["area: devops","area: integration"],
    "Suggest the site starter automatically when `init` runs in a Jekyll or Slipway repository.",
    [
      "src/init.ts (detection and the suggestion only)",
      "tests/init-site-stack.test.ts (new)",
    ],
    [
      "Detect a Jekyll site by `_config.yml` plus a `Gemfile`; detect Slipway when the `Gemfile` names the Slipway theme. Parse files, never execute them.",
      "When detected, suggest copying the starter from `examples/starters/slipway/` and print the exact command. Do not write files unless the existing `init` flow already asks the user first.",
      "Leave behavior for every other repository unchanged. Test a Slipway repo, a plain Jekyll repo, and a non-Jekyll repo.",
    ],
    [
      "Detection works for the three cases and existing `init` tests pass.",
    ],
    ["toolchain.starter"], { dont: [...["Do not perform network access.","Do not change `init` output for repositories that are not Jekyll sites."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.companions", "File the matching issues in the Slipway and Seaworthy repositories", "maintainer", "S", ["type: task"], ["area: devops","area: integration"],
    "Make the integration a two-sided contract instead of one repository's wishes.",
    [
      "GitHub issues in arminazimi/slipway and arminazimi/seaworthy; no repository files.",
    ],
    [
      "In Slipway: run Evergreen in CI with `integrations/slipway-seaworthy/`, copy the starter, and add the dependency rule from `docs/SITE_STACK.md` to its `AGENTS.md` (related: #1299, #1304).",
      "In Seaworthy: run Evergreen in CI with the monorepo fixture's shape in mind (#1300), and add \"turn on `SEAWORTHY_ENABLED`\" to the release checklist.",
      "Link each new issue back to this epic.",
    ],
    [
      "Both repositories have linked issues.",
    ],
    ["toolchain.workflow","toolchain.agents-guide","toolchain.starter"], { dont: [...["Do not change either repository's code in this task."], ...DONT] }),
  t("E-v08-toolchain", "V08", "toolchain.demo", "Record the full loop: Evergreen guards, Seaworthy verifies", "maintainer", "S", ["type: docs"], ["area: devops","area: integration"],
    "Show an agent edit a Slipway-shaped site, get a deprecated dependency refused, and see the site verified.",
    [
      "demos/site-stack.tape",
      "docs/assets/demos/",
    ],
    [
      "Blocked until the Seaworthy CLI is installable. Start when `npx seaworthy verify` works on a built site.",
      "Reuse the agent demo from #1255 for the refusal, then run Seaworthy on the fixture site.",
    ],
    [
      "The recording regenerates from a tape file in CI.",
    ],
    ["readme.tapes","readme.demo-agent","toolchain.workflow","toolchain.agents-guide"], { dont: [...["Do not fake Seaworthy output."], ...DONT], blocked: "Seaworthy has no installable release yet. Start when `npx seaworthy verify` works on a built site." }),
  t("E-v09-receipts", "V09", "receipts.core", "Define the `evergreen.receipt.v1` contract and builder", "strong", "M", ["type: task"], ["area: agent","area: core"],
    "Capture what a change did to the findings in one deterministic, schema-validated object.",
    [
      "src/receipt.ts (new)",
      "schemas/receipt.v1.schema.json (new)",
      "tests/receipt.test.ts (new)",
    ],
    [
      "Read `src/fix/verify.ts`. Use `verifyFix` for the comparison; do not change it.",
      "Export `buildReceipt(before, after, options?)` returning `{ schema: \"evergreen.receipt.v1\", counts, resolved, remaining, introduced, commands, data }`. Each finding entry carries id, rule, title, severity, and path with line. `commands` are the suggested verification commands and are never run.",
      "No timestamps other than values already in the scan results. Sort every list deterministically.",
      "Write the JSON Schema and validate builder output against it in the tests, the way other `*.v1` schemas are tested.",
      "Cover resolved, remaining, introduced, an empty change, and identical scans.",
    ],
    [
      "Output validates against the schema and is deterministic.",
      "Tests cover all five cases.",
    ],
    [], { dont: [...["Do not read the clock or the environment.","Do not change `src/fix/verify.ts`."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.markdown", "Render a receipt as Markdown for a pull request body", "free", "S", ["type: task"], ["area: agent","area: core"],
    "Make the receipt readable in a pull request and safe to paste.",
    [
      "src/receipt-markdown.ts (new)",
      "tests/receipt-markdown.test.ts (new)",
    ],
    [
      "Export `renderReceiptMarkdown(receipt): string`. A heading with the verdict, a count table, then sections for resolved, remaining, and introduced findings, and the suggested commands in a code block.",
      "Start with the marker `<!-- evergreen-receipt -->` so a tool can find and update it. Put long lists in `<details>`. Keep the whole receipt under 60 lines for a typical change.",
      "Escape Markdown and HTML in titles and paths, including pipes in table cells. Never print absolute paths.",
      "Compare exact output for each verdict in tests.",
    ],
    [
      "Output is deterministic and escaped.",
      "Tests cover each verdict and hostile titles.",
    ],
    ["receipts.core"], { dont: [...["Do not edit `src/receipt.ts`."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.cli", "Add `evergreen receipt`", "strong", "M", ["type: task"], ["area: agent","area: core"],
    "Let an agent or reviewer produce a receipt from a saved scan and the current tree with one command.",
    [
      "src/cli-main.ts (usage text and one new command block)",
      "src/completions.ts",
      "tests/receipt-cli.test.ts (new)",
    ],
    [
      "Add `evergreen receipt [path] --before <scan.json> [--format markdown|json]`. It reads the earlier `scan --json` output, scans the path now, and prints the receipt.",
      "Treat `--before` as untrusted input: validate it against the scan output contract, bound the file size and nesting depth the way the package-file parsers do (see #1490), and fail with a usage error naming the problem.",
      "Exit codes follow `docs/decisions/0016-cli-exit-codes.md`. Add `--fail-on-introduced` to exit non-zero when the change introduced findings; the default exit stays zero.",
      "Update usage text and completions. Test the built CLI: resolved and introduced cases, a malformed `--before`, an oversized file, and both formats.",
    ],
    [
      "`evergreen receipt` works in both formats and is covered by CLI tests.",
    ],
    ["receipts.core","receipts.markdown"], { dont: [...["Do not run suggested commands.","Do not change existing command output."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.mcp", "Return a receipt from `verify_migration`", "strong", "S", ["type: task"], ["area: agent","area: core"],
    "Give agents the receipt in the same call they already make to finish a migration.",
    [
      "src/mcp.ts (the verify_migration handler)",
      "schemas/verification.v1.schema.json (additive fields)",
      "tests/mcp-receipt.test.ts (new)",
    ],
    [
      "Add `receipt` (the object) and `receipt_markdown` (the string) to the tool result. Both are new optional fields; existing fields and their meaning do not change.",
      "Update the output schema and the tests that pin it. Keep the tool read-only.",
      "Test a resolved finding and a finding that remains.",
    ],
    [
      "Existing MCP tests pass and the new fields validate.",
    ],
    ["receipts.core","receipts.markdown"], { dont: [...["Do not rename or remove any existing field.","Do not run commands."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.action-comment", "Add \"resolved by this pull request\" to the Action comment", "strong", "S", ["type: task"], ["area: agent","area: core"],
    "Show reviewers what a change fixed, not only what it broke.",
    [
      "src/pr-comment.ts",
      "tests/pr-comment-resolved.test.ts (new)",
    ],
    [
      "Read `src/pr-comment.ts` and `src/diff.ts` to see how the comment already compares the base and the head. Use that comparison and `verifyFix`; do not add a second scan.",
      "When the head resolved findings the base had, add a short section listing them, capped at ten with a count of the rest.",
      "When nothing was resolved the comment must be byte-identical to today's.",
      "If the comment code has no base findings available, stop and ask in the issue instead of redesigning it.",
    ],
    [
      "Tests cover resolved, none resolved, and more than ten resolved.",
    ],
    [], { dont: [...["Do not commit `dist/action/index.js`; only the release pull request regenerates it."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.prompt", "Ask agents for a receipt in the migration prompt", "free", "S", ["type: task"], ["area: agent","area: core"],
    "Make the agent end every migration with a receipt in its pull request.",
    [
      "src/migration-prompt.ts",
      "the test file that covers renderMigrationPrompt (find it with a search)",
    ],
    [
      "Extend step 4 so the agent also pastes the `receipt_markdown` from `verify_migration` (or the output of `evergreen receipt`) into the pull request body.",
      "Keep every existing limit sentence. Update the exact-string test.",
    ],
    [
      "The prompt asks for the receipt and its test passes.",
    ],
    ["receipts.cli","receipts.mcp"], { dont: [...["Do not edit `skills/`; those files generate plugin packages."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.docs", "Document verification receipts", "free", "S", ["type: docs"], ["area: agent","area: core"],
    "Explain the receipt so reviewers know how to read and reproduce one.",
    [
      "docs/RECEIPTS.md (new)",
      "docs/llms.txt (one link)",
      "docs/llms-full.txt (generated)",
    ],
    [
      "Show a real receipt from `examples/demo`, how to reproduce it, and what each section means.",
      "Add one link in `docs/llms.txt` and run `npm run build:llms`.",
    ],
    [
      "The page exists and `npm run build:llms` leaves no drift.",
    ],
    ["receipts.cli"], { dont: [...["Do not edit `README.md`.","Do not invent output."], ...DONT] }),
  t("E-v09-receipts", "V09", "receipts.golden", "Add a golden receipt example", "free", "S", ["type: test"], ["area: agent","area: core"],
    "Keep a reviewed receipt in the repository that fails the build if the format drifts.",
    [
      "examples/receipts/ (new)",
      "tests/receipts-golden.test.ts (new)",
    ],
    [
      "Create `before.json` and `after.json` scan outputs from `examples/demo` before and after one finding is removed, then the expected `receipt.json` and `receipt.md`.",
      "The test rebuilds both from the two scans through the library API and compares byte for byte.",
    ],
    [
      "The golden files exist and the test fails when output changes.",
    ],
    ["receipts.core","receipts.markdown"], { dont: [...["Do not write files from the test."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.contract", "Define the `evergreen.plan.v1` contract", "strong", "S", ["type: task"], ["area: agent","area: core"],
    "Fix the shape of a migration plan so the rest of the work can proceed in parallel.",
    [
      "src/plan.ts (new; types only)",
      "schemas/plan.v1.schema.json (new)",
      "tests/plan-schema.test.ts (new)",
    ],
    [
      "Define `Plan` as `{ schema: \"evergreen.plan.v1\", waves: Wave[], items: PlanItem[], summary }`.",
      "A `PlanItem` has `id`, `findingId`, `title`, `severity`, `touches` (sorted repo-relative paths), `branch` (suggested), and `wave` (zero-based).",
      "A `Wave` is `{ index, itemIds }`. The schema must reject an item that appears in two waves.",
      "Write sample valid and invalid documents and test them against the schema.",
    ],
    [
      "The schema accepts the valid sample and rejects the invalid ones.",
    ],
    [], { dont: [...["Do not implement the builder here.","Do not add a runtime dependency; use the validation approach the other schema tests use."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.touch-set", "Compute the files each finding touches", "strong", "M", ["type: task"], ["area: agent","area: core"],
    "Know which files a migration will edit, so two migrations that edit the same file are never scheduled together.",
    [
      "src/plan-touch-set.ts (new)",
      "tests/plan-touch-set.test.ts (new)",
    ],
    [
      "Read `src/migration-packet.ts` to see how affected files are derived, and reuse it; read `src/source-usage.ts` for usage locations.",
      "Export `touchSet(finding, context): string[]`: the finding's own file, the packet's affected files, and for a dependency finding the manifest and its lockfile (two findings in one lockfile conflict).",
      "Return sorted, repo-relative, de-duplicated paths with forward slashes on every platform.",
      "Test a runtime pin, an npm dependency with a lockfile, a GitHub Action, and a finding with source usages in several files.",
    ],
    [
      "Output is deterministic across platforms.",
      "Tests cover the four finding kinds.",
    ],
    ["plan.contract"], { dont: [...["Do not run any repository code.","Do not add network access."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.waves", "Schedule conflict-free waves", "strong", "S", ["type: task"], ["area: agent","area: core"],
    "Group tasks so every task in a wave touches different files from the others in that wave.",
    [
      "src/plan-waves.ts (new)",
      "tests/plan-waves.test.ts (new)",
    ],
    [
      "Export `scheduleWaves(items: Array<{ id: string; touches: string[]; severity: Severity }>): string[][]`.",
      "Use a deterministic greedy colouring: order by severity (highest first) then id, and place each item in the first wave where it conflicts with nothing.",
      "Add a test with a small deterministic generator that checks three invariants over a few hundred cases: every item appears exactly once, no two items in a wave share a path, and the same input always gives the same output.",
    ],
    [
      "The invariants hold in the generated cases and in hand-written edge cases (empty input, everything conflicting, nothing conflicting).",
    ],
    ["plan.contract"], { dont: [...["Do not import scan or CLI code; this function takes plain data."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.build", "Build a plan from a scan", "strong", "M", ["type: task"], ["area: agent","area: core"],
    "Turn a scan result into the plan object.",
    [
      "src/plan-build.ts (new)",
      "tests/plan-build.test.ts (new)",
    ],
    [
      "Export `buildPlan(scan, options?): Plan` using `touchSet` and `scheduleWaves`.",
      "Branch names are deterministic: `evergreen/<rule-id>-<first 8 characters of the finding id>`, sanitised for git.",
      "Findings that cannot be migrated independently (no packet) still appear as items with a note; none is dropped silently.",
      "Validate every produced plan against the schema in tests. Cover an empty scan and a scan with a shared lockfile.",
    ],
    [
      "Plans validate against the schema and are deterministic.",
    ],
    ["plan.touch-set","plan.waves"], { dont: [...["Do not execute migration commands.","Do not read the clock."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.cli", "Add `evergreen plan`", "strong", "M", ["type: task"], ["area: agent","area: core"],
    "Let anyone, or any agent host, get the waves with one command.",
    [
      "src/cli-main.ts (usage text and one new command block)",
      "src/plan-render.ts (new; text output)",
      "src/completions.ts",
      "tests/plan-cli.test.ts (new)",
    ],
    [
      "Add `evergreen plan [path] [--json] [--wave <n>]`. Text output lists each wave and its tasks with severity, title, and files; `--wave` prints one wave.",
      "JSON output is the plan object and must validate against `plan.v1`.",
      "Follow `docs/decisions/0016-cli-exit-codes.md`. An empty plan exits zero with a clear message.",
      "Update usage and completions. Test the built CLI on `examples/demo` in both formats and with an out-of-range `--wave`.",
    ],
    [
      "`evergreen plan` works in text and JSON and is covered by CLI tests.",
    ],
    ["plan.build"], { dont: [...["Do not change any existing command's output."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.mcp", "Add a `plan_migrations` MCP tool", "strong", "S", ["type: task"], ["area: agent","area: core"],
    "Let a coordinating agent fetch the waves and hand tasks to other agents.",
    [
      "src/mcp.ts (tool list, schema map, handler)",
      "docs/MCP.md (one table row)",
      "tests/mcp-plan.test.ts (new)",
    ],
    [
      "Follow how `scan_repository` is declared. Input: `repository_path`. Output: the plan object, with its output schema.",
      "Mark it read-only and update the tests that pin the tool list and annotations.",
    ],
    [
      "The tool is listed, read-only, and validates against the schema.",
    ],
    ["plan.build"], { dont: [...["Do not change any existing tool."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.dispatch-example", "Add a dispatch example that prints one worktree command per task", "free", "S", ["type: docs"], ["area: agent","area: core"],
    "Show how a host turns waves into parallel agent sessions without Evergreen running anything.",
    [
      "examples/plan-dispatch/dispatch.mjs (new)",
      "docs/PLAN.md (new)",
      "docs/llms.txt (one link)",
      "tests/plan-dispatch.test.ts (new)",
    ],
    [
      "The script reads `evergreen plan --json` from stdin and, per task, prints the `git worktree add` command and the name of the `migrate-finding` prompt a host would run. It prints only; it never runs a command.",
      "`docs/PLAN.md` explains waves, the touch-set rule, and why tasks within a wave are safe to run at once. Run `npm run build:llms` after adding the link.",
      "Test the script on the plan for `examples/demo`: exact output, no child process spawned.",
    ],
    [
      "The example output is tested and the page is linked.",
    ],
    ["plan.cli"], { dont: [...["Do not spawn processes from the example.","Do not edit `README.md`."], ...DONT] }),
  t("E-v09-plan", "V09", "plan.fixture-monorepo", "Add a monorepo fixture and an end-to-end wave test", "free", "S", ["type: fixture"], ["area: agent","area: core"],
    "Prove the plan keeps conflicting tasks apart on a repository that has plenty of them.",
    [
      "tests/fixtures/plan/monorepo/ (new)",
      "tests/plan-e2e.test.ts (new)",
    ],
    [
      "Build a workspaces repository with at least eight findings: several in one shared lockfile, some in separate packages, and some in workflow files.",
      "The test runs the built CLI `plan --json`, validates the output against the schema, and asserts that tasks sharing a lockfile are in different waves and that disjoint tasks share a wave.",
    ],
    [
      "The fixture produces a stable plan and the test passes.",
    ],
    ["plan.cli"], { dont: [...["Do not run `npm install` in the fixture."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.guardrail-tasks", "Define 20 \"add this dependency\" benchmark tasks", "free", "S", ["type: fixture"], ["area: validation","area: agent"],
    "Measure whether an agent avoids a deprecated package when asked to add one.",
    [
      "benchmarks/agent-guardrail/tasks.json (new)",
      "benchmarks/agent-guardrail/validate.ts (new)",
      "tests/benchmark-guardrail-tasks.test.ts (new)",
    ],
    [
      "Each task has an id, a short natural-language request, the Package URL the request invites, the registry rule id that flags it, and the replacement the rule names.",
      "Choose 20 packages from `registry/*.json` with an authoritative deprecation or end-of-life rule across several ecosystems.",
      "`validate.ts` checks each rule id exists and that `check` reports the purl as deprecated, offline. The test runs the validator.",
    ],
    [
      "20 tasks validate against the bundled registry.",
    ],
    [], { dont: [...["Do not add registry rules.","Do not use the network."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.guardrail-score", "Score guardrail runs", "free", "S", ["type: task"], ["area: validation","area: agent"],
    "Classify what an agent did with a request to add a deprecated package.",
    [
      "benchmarks/agent-guardrail/score.ts (new)",
      "tests/benchmark-guardrail-score.test.ts (new)",
    ],
    [
      "Input: a task entry and the list of Package URLs the agent added to the manifest. Output one of `refused`, `named-replacement`, `other-replacement`, `added-deprecated`.",
      "Compute rates per arm. Document the definitions in a comment at the top of the file.",
      "Test each outcome and an empty run.",
    ],
    [
      "All four outcomes are tested and rates are deterministic.",
    ],
    ["proof.guardrail-tasks"], { dont: [...["Do not call a model or the network."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.guardrail-arm", "Run the guardrail arm with and without the hook", "strong", "M", ["type: task"], ["area: validation","area: agent"],
    "Run the same tasks with the guardrail off and on, using the shared harness.",
    [
      "benchmarks/agent-guardrail/run.ts (new)",
      "tests/benchmark-guardrail-run.test.ts (new)",
    ],
    [
      "Reuse the adapter interface and worktree isolation from the harness in #243. If it is not merged, stop and ask in the issue.",
      "Arm A: no Evergreen. Arm B: the agent hook or skill from `docs/AGENT_SKILLS.md` installed. Score with `score.ts` and write one result file per run.",
      "Ship a fake adapter that scripts both outcomes, so the test needs no API key, and test that results are written and scored.",
    ],
    [
      "The runner completes with the fake adapter in both arms.",
    ],
    ["bench.harness","proof.guardrail-tasks","proof.guardrail-score"], { dont: [...["Do not call real models in tests or CI."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.plan-arm", "Measure sequential against wave-parallel migration", "strong", "M", ["type: task"], ["area: validation","area: agent"],
    "Show how much sooner a plan's waves finish than the same tasks done one after another.",
    [
      "benchmarks/agent-plan/run.ts (new)",
      "tests/benchmark-plan-run.test.ts (new)",
    ],
    [
      "Use the monorepo fixture from the plan epic and the harness adapters from #243.",
      "Run the tasks sequentially, then by wave with each wave in parallel, and record wall-clock time per arm and whether every finding was resolved.",
      "Use a fake adapter with scripted delays so the test is deterministic and fast.",
    ],
    [
      "The runner reports both timings and resolution counts with the fake adapter.",
    ],
    ["bench.harness","plan.fixture-monorepo"], { dont: [...["Do not call real models in tests or CI.","Do not modify the plan fixture."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.report", "Generate the proof tables from result files", "free", "S", ["type: task"], ["area: validation","area: agent"],
    "Turn raw results from both arms into the Markdown tables the page needs.",
    [
      "schemas/benchmark-result.v1.schema.json (new)",
      "tools/benchmark-report.ts (new)",
      "tests/benchmark-report.test.ts (new)",
    ],
    [
      "Define the result file schema that the guardrail and plan runners write.",
      "The tool reads a directory of results and prints Markdown to stdout: one table per arm with rates, counts, and the agent and model versions.",
      "Test with fixed result files and compare exact output.",
    ],
    [
      "Output is deterministic and validated against the schema.",
    ],
    ["proof.guardrail-score"], { dont: [...["Do not write into `docs/`; the maintainer pastes the output when publishing."], ...DONT] }),
  t("E-v09-proof", "V09", "proof.publish", "Run both arms with real agents and publish the results", "maintainer", "M", ["type: docs"], ["area: validation","area: agent"],
    "Publish numbers with methodology that anyone can reproduce.",
    [
      "docs/AGENT_PROOF.md (new)",
      "docs/llms.txt",
    ],
    [
      "Run both arms with at least two agents, the guardrail arm over all 20 tasks and the plan arm on the monorepo fixture.",
      "Publish the tables from `tools/benchmark-report.ts`, the exact versions, the cost, and every failure, in the spirit of #1311.",
      "Link the page from the benchmark report (#245).",
    ],
    [
      "The page is published with methodology and reproduction commands.",
    ],
    ["proof.guardrail-arm","proof.plan-arm","proof.report","bench.report"], { dont: [...["Do not drop runs that look bad."], ...DONT] }),
];
