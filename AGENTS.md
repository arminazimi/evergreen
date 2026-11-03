# AGENTS.md

Instructions for coding agents (Codex, Claude Code, Cursor, Copilot, Kilo Code, and others) and for people working the same way. Read this before changing the repository.

## What Evergreen is

Evergreen is a local-first CLI that finds evidence-backed lifecycle risks (deprecations, end-of-life runtimes, retired APIs) in a repository, shows exactly where they are used, and produces migration context for humans and agents. It ships as one TypeScript package with a CLI, a local MCP server, a GitHub Action, an Agent Skill, and Codex and Claude plugins.

## Setup and commands

Requires Node.js 22 or newer.

```bash
npm ci                # install
npm run check         # build, Action bundle, tests, plugin checks, evals — must pass before every PR
npm test              # tests only
npm run dev -- scan   # run the CLI from source
```

`npm run validate:public-repos` runs the pinned public-repository corpus. It needs network access, so it is not part of `npm run check`; run it when detector behavior changes.

### Running the corpus locally

An uncached full run fetches all repositories and takes very long. Always:

1. `export EVERGREEN_CORPUS_CACHE=~/.cache/evergreen-corpus`, then `npm run corpus:warm` once (and again after pulling `main`).
2. Run with `--offline` afterwards, for example `npm run validate:public-repos -- --offline`.
3. While developing, narrow the run with `--changed`, `--ecosystem <name>`, or `--repo <owner/name>`; run the full corpus only at the end.
4. Leave `--concurrency` at its default (16); do not lower it unless fetches time out.
5. `npm run record:corpus-run` accepts no narrowing flags and needs a clean tree: warm first, then `npm run record:corpus-run -- --offline`.

Details: [docs/VALIDATION.md](docs/VALIDATION.md), "Fetching and the checkout cache".

## Architecture boundaries

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| Layer | Lives in | Owns | Must not |
|---|---|---|---|
| Scan engine | `src/engine.ts`, `src/domain.ts` | Detector attribution, sorting, output contracts | Import built-in detectors or contain ecosystem-specific logic |
| Detector SDK | `src/sdk.ts` | The public seam: API version, stable ID, one `scan` operation | Change without a versioned decision |
| Detectors | `src/detectors/` | Reading manifests and lockfiles for one ecosystem | Make network calls or execute repository code |
| Registry | `registry/*.json` | Reviewed lifecycle rules with authoritative sources | Contain executable logic or unsourced claims |
| Source usage | `src/source-usage.ts` | Repository traversal and usage matching for all detectors | Hold detector-specific rules |
| Adapters | `src/cli.ts`, `src/mcp.ts`, `src/github-action.ts`, `skills/`, `plugins/` | Translating one interface to a host | Own detector, rule, or migration logic |

Trust rules that apply to every change:

- Repository contents are untrusted input. Parse them; never evaluate or execute them.
- Scans never use the network. Detectors read repository files and bundled data only.
- Every finding names its detector, rule, evidence source, and exact location.
- Lifecycle claims need an authoritative, versioned source. Never infer status from popularity or from a newer version existing.
- Evergreen suggests verification commands; it never runs migration commands itself.

## Generated files — do not edit by hand

| Path | Regenerate with |
|---|---|
| `plugins/claude/`, `plugins/codex/`, `.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json` | `npm run build:plugins` (source: `skills/`) |
| `dist/action/index.js` | `npm run build:action` (not committed on `main`; the Release workflow builds it onto the `release/<tag>` branch that release tags point at) |
| `docs/llms-full.txt` | `npm run build:llms` (source: the pages linked from `docs/llms.txt`; gitignored — the Pages workflow builds it before Jekyll; no pull request commits it) |
| `docs/sitemap.xml`, `docs/rules/index.md` | `npm run build:reference` / `node dist/tools/build-reference-pages.js --site` (source: `registry/*.json`; gitignored — Pages builds them before Jekyll; Search Console URL unchanged) |
| `docs/dashboard/data.json` | `npm run build:dashboard` (source: `benchmarks/thresholds.json` and `benchmarks/public-repositories/`; gitignored — the Pages workflow builds it before Jekyll; no pull request commits it) |
| `docs/api/v1/` | `npm run build:data-api` (source: `registry/*.json`; gitignored — the Pages workflow builds it before Jekyll; no pull request commits it) |
| `docs/rules/` (per-rule pages) | `npm run build:reference` (source: `registry/*.json`) |
| `docs/assets/og/` | `npm run build:og-images` (source: `registry/*.json`, brand social-preview template) |
| `docs/eol/` | `npm run build:answer-pages` (source: `registry/*.json`) |
| `docs/ROADMAP.md` | `node planning/roadmap/roadmap-md.mjs` (source: `planning/roadmap/`) |

CI fails when generated output drifts from its source. Exceptions not committed on `main`: `dist/action/index.js` (each merge rewrote the same minified lines, so parallel pull requests conflicted; release tags still need it — see `docs/RELEASING.md`, step 5); and `docs/llms-full.txt`, `docs/sitemap.xml`, `docs/rules/index.md`, `docs/dashboard/data.json`, and `docs/api/v1/` (Pages generates them during the site build; `check:reference`, `check:llms`, `check:dashboard`, and `check:data-api` fail when the sources would not produce a well-formed site).

## Working on an issue

1. Pick an open issue whose dependencies are closed. Its `lane:` label says who it suits; `size:` says how big it is.
2. Follow the issue's **Agent brief**: touch only the listed files, follow the steps, respect the "Do not" list.
3. **One issue = one pull request.** If you find more work, open a follow-up issue instead of growing the PR.
4. Add or update tests for observable behavior. Keep JSON output deterministic and stable across platforms.
5. Run `npm run check` and make sure it passes.
6. Self-check the diff against the [review rubric](docs/REVIEW.md) (scope, correct layer, real tests, honest docs) and fix every item that would block a merge.
7. Open the PR with `Closes #<issue>` and list the commands you ran. For rule changes, link the evidence.

## Parallel-task protocol

Use this when more than one agent or contributor works on the repository at once. Follow it with no other context.

### One branch per task from the same base

1. Branch from up-to-date `main` (or the issue's stated base). Name it `<type>/<issue-number>-<short-name>` (for example `docs/2022-parallel-task-protocol`).
2. One issue = one pull request = one branch. Do not stack unrelated issues on the same branch.
3. Prefer an isolated git worktree when running multiple tasks in parallel, so each branch has its own working tree and does not stomp on another.

### Shared paths

Prefer adding new per-item files instead of editing assembled or shared registries. Paths many tasks touch:

| Path | How to change it |
|---|---|
| `benchmarks/thresholds.json` | Assembled. Edit `benchmarks/thresholds/<detector>.json`, then regenerate with the assembler in `benchmarks/thresholds/index.ts`. Do not edit the assembled file by hand. |
| `examples/capabilities.json` | Assembled. Edit per-item files under `src/capabilities/`, then regenerate. Do not edit the assembled file by hand. |
| Generated paths in [Generated files](#generated-files--do-not-edit-by-hand) | Edit the listed source; regenerate; never hand-edit the output. |
| `benchmarks/public-repositories/` | One file per repo. Add a new file; do not edit a monolith. |
| `tools/importers/index.ts` | Registration list. Adding an importer means a new file **and** one import line here — expect conflicts. |
| `AGENTS.md`, `CONTRIBUTING.md` | Shared docs; rebase carefully if another PR touched them. |
| `package-lock.json` | Shared lockfile; regenerate from `package.json` when needed, do not hand-merge blindly. |
| `CHANGELOG.md` | Do not edit directly. Add a fragment under `changes/` (see [changes/README.md](changes/README.md)). |

**Shared registry rule:** A shared or assembled registry must not be edited by hand. Edit the per-item source; regenerate the assembled document; commit both when the check requires the assembled file to match.

### On conflict

- Do not force-push.
- Rebase onto latest `main` (or merge if the brief says so).
- Resolve by keeping both parties' new per-item files.
- Never "fix" a conflict by hand-editing an assembled registry — regenerate it from sources.
- If the conflict is outside your issue's file list, stop and ask, or open a follow-up issue, rather than expanding scope.

### When to rebase

- Rebase onto `main` before opening the PR if `main` moved.
- Rebase (do not merge `main` into the branch) when CI is green except for being behind, or when resolving conflicts after another PR landed.
- Do not rewrite history that is already under review without need.

## Conventions

- Commit messages use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Match the surrounding code: naming, comment density, and error style.
- A pull request that changes user-visible behavior adds a changelog fragment: one file in `changes/` holding one bullet (see [changes/README.md](changes/README.md)). Do not edit `CHANGELOG.md` directly, so parallel pull requests never conflict on it.
- Do not reformat unrelated files or add dependencies without a reason stated in the PR.
- Public contracts (`schemas/`, `src/sdk.ts`, MCP tool shapes, CLI JSON output) change only additively unless a decision record in `docs/decisions/` says otherwise.
- A change needs a decision record when it changes a public contract: anything under `schemas/`, `src/sdk.ts`, an MCP tool's name, description, input shape, or output, or the JSON a command writes under `--json`. Add a numbered record in `docs/decisions/` in the same pull request and link it from the pull request; `docs/decisions/index.md` alone is the index, not a record. `.github/workflows/decisions.yml` fails a pull request that changes `schemas/`, `src/sdk.ts`, or `src/mcp.ts` without a new or changed record. A CLI JSON change also needs its schema under `schemas/`, which is what the workflow can see.

## Quality bar

Reference quality is measured in [docs/QUALITY.md](docs/QUALITY.md) and enforced by `npm run check`, which runs `check:quality`. A failing run blocks the pull request, and no one may merge past it.

- **File size:** median 300 lines or fewer. No hand-written `src/` file over 800 lines, and none over 1,000, unless it is in the allowlist.
- **Complexity:** at most 15 per function. A function over 15 is not allowed unless it is in the allowlist.
- **Type safety:** no explicit `any`, no `@ts-ignore` or `@ts-expect-error`; no new `as unknown as` or non-null assertion. `strict`, `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters` stay on.
- **Boundaries:** the six rules in [Architecture boundaries](#architecture-boundaries) hold.
- **Coverage:** lines 93%, branches 87%, functions 93%. No pull request lowers a total below `main`.
- **Mutation:** break at 60, high at 80, on the mutated core. The nightly run gates once its first complete score exists.
- **Docs:** generated pages and indexes match their sources, and the documentation site builds.
- **Security:** no runtime advisory and no high or critical advisory; a medium or low advisory only when it is listed by id. The OpenSSF Scorecard is 6.0 or more by v0.8.0.

Rules for every change:

- New debt fails. Do not add a file over 800 lines, a function over 15, or any `any`.
- Existing debt is listed in `benchmarks/quality-allowlist.json` with an owner and an `expires` date. When you fix a debt, remove or tighten its entry. Never edit the allowlist to make a change pass: do not add an entry or raise a ceiling.
- Before you change anything these criteria cover (`src/`, `tools/`, `tests/`, `benchmarks/`, `tsconfig.json`, `.github/workflows/`), read [docs/QUALITY.md](docs/QUALITY.md).

## Dependencies

Before adding any dependency, runtime, or GitHub Action to this repository (or changing its pinned version), check it with Evergreen using its Package URL:

```bash
npm run dev -- check pkg:npm/<name>@<version>      # npm package
npm run dev -- check pkg:github/<owner>/<repo>@<ref>   # GitHub Action
```

Do not add it if the check reports an end-of-life, deprecated, or retired result; pick the replacement it names, or ask in the issue. A new dependency needs a reason in the PR (see Conventions). Hosts that support the Evergreen Agent Skill or MCP server get this check as a guardrail: setup is in [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md#use-the-guardrail-in-this-repository). CI also scans the repository on every pull request and fails on any finding the baseline does not cover.

## More

- [docs/REVIEW.md](docs/REVIEW.md) — review rubric for agent pull requests: what to check beyond CI, and what must block a merge
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution paths and review expectations
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases and what each one delivers
- [docs/DETECTORS.md](docs/DETECTORS.md) — detector and registry authoring
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities
