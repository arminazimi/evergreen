# Lifecycle importers

An importer reads one authoritative, machine-readable source and drafts [lifecycle rules](RULES.md) from it. Importers exist so the registry grows from sources instead of being typed in by hand. They are maintainer tooling: scans never run them, never use the network, and never read their drafts. The decision behind them is [Decision 0005](decisions/0005-lifecycle-importers.md).

Two rules hold for every importer:

- **Importers never write the registry.** They produce drafts. A person reviews each draft and changes `registry/` in a pull request.
- **Drafts are marked unreviewed.** The runner stamps every draft with `provenance.reviewer: "pending-review"`, and a test fails if that value ever appears in a bundled registry.

## The workflow

```bash
npm ci && npm run build

# 1. Draft rules from the source (network)
node dist/tools/importers/run.js nodejs-schedule --out drafts.json

# 2. See exactly what would change in the registry
node dist/tools/importers/diff.js drafts.json registry/nodejs.json

# 3. Write the pull-request description, with an evidence table
node dist/tools/importers/pr-body.js drafts.json registry/nodejs.json --out body.md
```

`run.js --list` lists the importers. `diff.js` exits with 10 when there are changes, 0 when there are none, and 1 on an error. Only `run.js` uses the network.

### Reviewing drafts

The diff classifies each draft as **added**, **changed** (split into dates, sources, and other fields), **removed**, or **unchanged**, and flags **duplicates**: a draft with the same component and versions as an existing rule under a different id. Applying a draft means overlaying the fields the importer sets on the existing rule, so fields an importer never sets (migration steps, usage matchers, hand-written text) are never reported and never lost.

When you accept a draft:

1. Check each source against the rule: the event, the affected versions, and the date.
2. Copy the rule into the registry file and set `provenance.reviewer` and `provenance.reviewedAt`. Leave `importer` as it is.
3. Keep one id per component. If the diff reports a duplicate, decide which id stays and retire the other.
4. Add `migration` and `usage` for a new rule if you can; importers leave them to people.
5. Run `npm run check`.

Do not remove a rule only because an importer stopped drafting it. A source can stop listing something because the thing is gone, and a retired image or release is exactly what an old workflow needs to be told about. The diff reports such rules as "no longer drafted"; remove one only when its fact is no longer true.

## The weekly run

[`importers.yml`](../.github/workflows/importers.yml) runs every importer that has a registry file each Tuesday (and on manual dispatch). For each one it drafts rules, compares them with the registry, and, only when they differ, opens or updates one pull request on the branch `importers/<importer-id>`. The pull request adds `importer-drafts/<importer-id>.json` and the evidence table from `pr-body.js`; it never edits `registry/`. A maintainer reviews it as described above and changes the registry in a separate commit. Python has two importers, so it gets two pull requests.

The drafting jobs have read-only permissions; only the second job can write, and it only pushes that branch and opens the pull request. The repository setting "Allow GitHub Actions to create and approve pull requests" must be on, and checks do not start on pull requests opened with the default token, so close and reopen the pull request (or push to its branch) to run them. `runner-images` is not in the run because it has no registry file.

## The importers

| Importer | Registry | Reads | Candidate list |
|---|---|---|---|
| `ci-images-1` | `ci-images` | The runner-images README and the announcement issues it links, filtered to Azure DevOps: Azure Pipelines hosted images that are scheduled for removal or have been retired. | none |
| `container-official-images` | `container` | The vendors' own Node.js and Python schedules: one "and older" `end-of-life` rule per image. The Docker Official Images files are read only to note which end-of-life lines still have published tags; they carry no lifecycle data. PostgreSQL, MySQL, and Ruby image rules stay hand-written. | none |
| `dotnet-1` | `dotnet` | The official .NET releases index: one `end-of-support` rule per release line whose end-of-life date has passed, each with its date. Lines that end in the future are noted, not drafted. | none |
| `dotnet-2` | `dotnet` | The NuGet registration API: one `deprecated` rule per candidate package whose every listed version the publisher deprecated as legacy, with the alternate package it names. | `tools/importers/dotnet-candidates.ts` |
| `endoflife-date` | `container` | The endoflife.date API v1 as an index over a sorted candidate list: one "and older" `end-of-life` rule per official Docker image. A product is drafted only with an official image and a release-policy link to the vendor's own page, which becomes the first source; endoflife.date is cited only as an index. | `tools/importers/endoflife-candidates.ts` |
| `go-1` | `go` | The Go release history and support policy: one `end-of-support` rule per Go release line that has lost support, from the "two newest major releases" policy. | none |
| `go-2` | `go` | The Go module proxy: direct modules whose latest `go.mod` carries an official `// Deprecated:` comment. | `tools/importers/go-2.ts` |
| `java-1` | `java` | The Oracle Java SE Support Roadmap and the Eclipse Temurin support page: one `end-of-support` rule per group of non-LTS JDK feature releases whose last Premier Support month is over, citing Temurin where it lists a release as EOSL. LTS releases are never drafted. The sources give a month, so the rules have no `deadline`. | none |
| `java-2` | `java` | Maven Central: dependencies whose own POM declares a `<relocation>` to new coordinates, found by walking down from the newest version while each POM keeps the same relocation. A relocation that only changes the version is skipped. | `tools/importers/maven-candidates.ts` |
| `kubernetes-1` | `kubernetes` | The Kubernetes Deprecated API Migration Guide: one `removed` rule per group, kind, and API version the guide says is no longer served. The guide names the release, not a date, so the `deadline` is the date of that release's announcement on kubernetes.io, from a small dated table in the importer. | none |
| `kubernetes-2` | `kubernetes` | The Kubernetes release history: one `end-of-life` rule per minor release among the five newest whose published end-of-life date has passed. These rules describe Kubernetes itself (`pkg:generic/kubernetes`), not an API version, and no detector reads them yet. | none |
| `nodejs-schedule` | `nodejs` | The Node.js Release Working Group's `schedule.json`: one `end-of-life` rule per release line from v18 whose end date has passed. | none |
| `python-release-cycle` | `python` | `peps.python.org/api/release-cycle.json`: the single "Python X.Y and older" runtime rule the Python detector reads. | none |
| `npm-deprecated` | `npm` | `registry.npmjs.org/<name>/latest`: packages whose latest version carries a deprecation notice. | `tools/importers/npm-candidates.ts` |
| `pypi-status` | `python` | PyPI's Simple API (PEP 792 project status markers): archived, deprecated, and quarantined projects. | `tools/importers/pypi-candidates.ts` |
| `github-actions-runtime` | `github-actions` | Each action's own `action.yml` at its major tags: releases that run on a Node.js runtime GitHub has retired. | `tools/importers/github-actions-candidates.ts` |
| `ruby-1` | `ruby` | The Ruby maintenance branches page: one `end-of-life` rule per release line the page marks eol, with its published end-of-life date. | none |
| `rust-1` | `rust` | `RELEASES.md` in the Rust repository: the one 'Rust 1.N and older are no longer supported' rule, from the policy that only the most recent stable release is supported. It moves every six weeks; headings dated in the future are ignored. | none |
| `rust-2` | `rust` | The crates.io sparse index (what Cargo reads): one rule per candidate crate listing its yanked versions. | `tools/importers/rust-candidates.ts` |
| `runner-images` | `github-runners` | The runner-images README and the announcement issues it links: images GitHub is deprecating or has retired. | none |

Some registries have no list of what is deprecated (npm and PyPI expose a flag per package), so those importers check a **candidate list**. To widen coverage, add a name to the list in a pull request: one line, in sorted order. A candidate that is not deprecated produces no rule, and the importer names it in its notes so it can be removed.

Two importers have limits worth knowing:

- `runner-images` drafts rules for a `github-runners` ecosystem that has no registry file and no detector yet, because Evergreen does not read `runs-on:` labels. Its drafts have no effect until one exists.
- `github-actions-runtime` relies on a small table of retired Node.js runtimes in `tools/importers/github-actions.ts`. Each row is a dated fact with the GitHub post that states it. Add a row, with its source, when GitHub retires another runtime.

## Writing an importer

An importer is one module that implements `Importer` from [`tools/importers/types.ts`](../tools/importers/types.ts):

```ts
export interface Importer {
  readonly id: string;        // lowercase letters, numbers, hyphens; becomes provenance.importer
  readonly ecosystem: string; // the registry its drafts belong to, for example "nodejs"
  readonly description: string;
  readonly sources: readonly { title: string; url: string }[];
  import(context: ImporterContext): Promise<{ rules: DraftRule[]; notes: string[] }>;
}
```

[`tools/importers/example.ts`](../tools/importers/example.ts) is a complete, small importer to copy from. The real ones next to it are the best reference for each kind of source.

### What the context gives you

`context.fetchText(url, { accept? })` is how an importer reads anything. It returns a response body, or throws an `ImporterError` for a failed response. `fetchJson(context, url)` parses JSON. `context.now` is the date of the run. An importer must not read files, the clock, or the environment, so a run can be replayed from a recording and gives the same drafts every time.

### What you return

Return complete [v2 rules](RULES.md) **without `provenance`**; the runner adds it. Return `notes`, a list of plain sentences for the reviewer about what you skipped and why, in a stable order. The runner sorts the rules by id, puts their fields in registry order, validates them as a v2 registry for your ecosystem, and fails with every problem listed.

Follow these as you write the rules:

- **Cite what you read.** The sources are the pages you fetched or the posts that state the fact. If you cannot establish a fact, do not draft it; write a note.
- **Set only what the source tells you.** Leave out `replacement` or `migration` unless the source gives it. A field you set overwrites the registry's value when a draft is applied; a field you leave out is left alone.
- **Use the ids and wording the registry already uses**, so a draft for an existing rule shows up as a change rather than a second rule. If an id would differ from an existing rule for the same component, the diff flags it.
- **Fill in the detector hint** (`x-<ecosystem>`) the ecosystem's detector reads, and make it agree with `purl` and `vers`.
- **Let time decide.** Compare dates to `context.now`, never to a fixed day, so a later run drafts the right thing.
- **Treat a missing thing and a failure differently.** A 404 for one candidate is worth a note. Any other failure should stop the run: an outage must never look like "nothing is deprecated".
- **Write for the detector as it is.** The Python detector reads one runtime rule; the drafts for it are one rule. A rule no detector can use is data, not protection.

### Recordings and tests

Tests never use the network. An importer is tested against a recording of its real responses:

```bash
# Capture today's responses (network) and write the drafts
node dist/tools/importers/run.js <id> --record tests/importers/recordings/<id>.json --out drafts.json

# Replay them (no network). Without --now, the run uses the day the recording was made.
node dist/tools/importers/run.js <id> --replay tests/importers/recordings/<id>.json
```

A recording holds every response, including failures such as a 404, keyed by URL and `Accept` header. Replay refuses a request nothing recorded, and refuses a recording that holds responses the importer no longer reads, so recordings cannot go stale unnoticed. Name the file after the importer's id.

Put the tests in `tests/importers/<id>.test.ts`. Test the recording end to end, then test the cases a recording cannot show with small inline contexts: the calendar moving (`now`), partial or malformed data, a missing item, and a failure. The tests for `nodejs-schedule` and `github-actions-runtime` are good models. Also check how your drafts compare with the existing registry using `diffDrafts` from `tools/importers/diff.ts`; that is how the first run of each importer found real differences between the sources and the hand-written rules.

### Registering it

Export the importer and add it to the list in [`tools/importers/index.ts`](../tools/importers/index.ts); `run.js --list` then shows it. If it needs a candidate list, keep the list in its own file, sorted, with a test that every entry is valid and distinct.

### Checks you do not have to write

`npm run check` already verifies that every committed recording is valid and named for its importer, that no bundled rule is still `pending-review`, and that `npm test` includes tests in subdirectories.

## What importers are not

- They do not decide what is true. A source can be wrong or ambiguous; the reviewer decides.
- They do not run on a schedule yet. Scheduling importers to open data pull requests is a separate step.
- They do not touch scans. A repository scan uses only the bundled registry and never the network.
