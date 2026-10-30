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
| `dist/action/index.js` | `npm run build:action` (release pull request only; ordinary pull requests must not commit it) |
| `docs/llms-full.txt` | `npm run build:llms` (source: the pages linked from `docs/llms.txt`) |
| `docs/rules/` | `npm run build:reference` (source: `registry/*.json`) |
| `docs/eol/` | `npm run build:answer-pages` (source: `registry/*.json`) |
| `docs/ROADMAP.md` | `node planning/roadmap/roadmap-md.mjs` (source: `planning/roadmap/`) |

CI fails when generated output drifts from its source. The exception is `dist/action/index.js`: it is one minified bundle that every merge rewrites, so parallel pull requests always conflict on it. Only the `chore: release` pull request regenerates and commits it (`EVERGREEN_VERIFY_ACTION_BUNDLE=1 npm run check` verifies it). If your branch conflicts on it, run `git checkout origin/main -- dist/action/index.js`.

## Working on an issue

1. Pick an open issue whose dependencies are closed. Its `lane:` label says who it suits; `size:` says how big it is.
2. Follow the issue's **Agent brief**: touch only the listed files, follow the steps, respect the "Do not" list.
3. **One issue = one pull request.** If you find more work, open a follow-up issue instead of growing the PR.
4. Add or update tests for observable behavior. Keep JSON output deterministic and stable across platforms.
5. Run `npm run check` and make sure it passes.
6. Open the PR with `Closes #<issue>` and list the commands you ran. For rule changes, link the evidence.

## Conventions

- Commit messages use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Match the surrounding code: naming, comment density, and error style.
- Do not reformat unrelated files or add dependencies without a reason stated in the PR.
- Public contracts (`schemas/`, `src/sdk.ts`, MCP tool shapes, CLI JSON output) change only additively unless a decision record in `docs/decisions/` says otherwise.

## Dependencies

Before adding any dependency, runtime, or GitHub Action to this repository (or changing its pinned version), check it with Evergreen using its Package URL:

```bash
npm run dev -- check pkg:npm/<name>@<version>      # npm package
npm run dev -- check pkg:github/<owner>/<repo>@<ref>   # GitHub Action
```

Do not add it if the check reports an end-of-life, deprecated, or retired result; pick the replacement it names, or ask in the issue. A new dependency needs a reason in the PR (see Conventions). Hosts that support the Evergreen Agent Skill or MCP server get this check as a guardrail: setup is in [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md#use-the-guardrail-in-this-repository). CI also scans the repository on every pull request and fails on any finding the baseline does not cover.

## More

- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution paths and review expectations
- [docs/ROADMAP.md](docs/ROADMAP.md) — phases and what each one delivers
- [docs/DETECTORS.md](docs/DETECTORS.md) — detector and registry authoring
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities
