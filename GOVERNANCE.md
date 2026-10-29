# Governance

Evergreen is maintainer-led and contributor-driven. This document says who is responsible for what, how decisions are made and recorded, how to escalate a disagreement or a security report, and what happens when a detector or rule loses its owner.

It does not repeat the contribution workflow ([CONTRIBUTING.md](CONTRIBUTING.md)) or the behavior standards ([CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)).

## Roles

| Role | Who | Responsible for |
|---|---|---|
| Contributor | Anyone who opens an issue or pull request, including people working with a coding agent | Following the issue brief, adding tests and evidence, running `npm run check`, and keeping one issue to one pull request. |
| Detector owner | A contributor trusted with one ecosystem, once assigned | Being the accountable reviewer for that ecosystem's detector, registry file, fixtures, corpus entries, documentation page, and maturity level. |
| Maintainer | Currently [@arminazimi](https://github.com/arminazimi), named in [`.github/CODEOWNERS`](.github/CODEOWNERS) | The final merge decision, releases and accounts, registry evidence review, public contracts, security response, and Code of Conduct enforcement. |

A coding agent has no separate standing: the account that opens the pull request is responsible for it, and the agent follows the same issue lanes, briefs, and gates as a person.

There is no steering committee or formal vote. The current maintainer grants maintainer access and records it in [`.github/CODEOWNERS`](.github/CODEOWNERS). Detector owners are named in [`MAINTAINERS.md`](MAINTAINERS.md) and the matching per-ecosystem lines in [`.github/CODEOWNERS`](.github/CODEOWNERS). Until another contributor adopts an ecosystem, the maintainer is the owner of every detector.

### Maintainer responsibilities

- Decide what merges, what the roadmap contains, and when a release ships. One issue is one pull request; scope changes become follow-up issues.
- Own the paths where correctness matters most: `/registry/`, `/schemas/`, `/src/sdk.ts`, `/src/domain.ts`, `/.github/workflows/`, `/.github/CODEOWNERS`, and `/action.yml`. [`.github/CODEOWNERS`](.github/CODEOWNERS) routes review for them.
- Publish the npm package, GitHub Action, signed data bundles, and generated plugins, and keep their accounts and marketplace submissions current.
- Respond to security reports under [SECURITY.md](SECURITY.md) and enforce the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep this document, ownership records, and the decision record directory current.

## How decisions are made

Most decisions are made in the issue or pull request where the work happens. Contributors argue for an approach with evidence, tests, and a working change; the maintainer decides when discussion does not settle it. There is no vote count and no requirement that every objection be withdrawn, only that it be answered.

Every merge needs a green `npm run check` and resolved review conversations. CI also runs the rules check on changed registry files and the self-scan that fails on findings outside the baseline. The branch protection rule on `main` requires one status check, `ci-ok`, which fails when any CI job failed or was cancelled and passes when a job was skipped; the merge queue runs it on `merge_group` before a pull request lands. The rule does not require an approving review. Review is therefore a convention the project keeps, not a gate GitHub enforces: a change to the paths in `.github/CODEOWNERS`, to lifecycle evidence, or to a public contract waits for the code owner, and green CI is not a substitute for that review.

### When a written decision is required

Write a decision record in [`docs/decisions/`](docs/decisions/) before or with the change when it:

- changes a public contract: a JSON schema in `schemas/`, the detector SDK in `src/sdk.ts`, an MCP tool shape, or CLI JSON output;
- changes an architecture boundary in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the roadmap, or the project's scope;
- promotes, demotes, retires, or narrows a detector, or changes what a detector promises;
- changes who may merge or release, or changes this document.

A decision record uses the next free number, a `Status:` line (`accepted`, `rejected`, or `superseded`), and the existing shape: `Problem`, `Decision`, and `Consequences`, with `Why` and `Alternatives rejected` where they help. An accepted record is not rewritten; a later record supersedes it and links back. The pull request that changes a contract carries the record, and a record without a corresponding change is still useful: a rejected proposal stays in the directory with its reasons.

A request for comments (RFC) in [`docs/rfcs/`](docs/rfcs/) is the optional place to argue for an expensive-to-reverse change before code exists. An accepted RFC does not replace a decision record; it is discussion, and the record is the outcome.

Registry rules are reviewed data, not decisions. They follow the [evidence policy](CONTRIBUTING.md#evidence-policy) and [rule format](docs/RULES.md): every rule cites an authoritative source, changes to `registry/` and `schemas/` get maintainer review, and importers may draft rules but never merge them. A draft whose `provenance.reviewer` is still `pending-review` or `unreviewed` is not merged.

### The versioned-decision rule for the SDK

`src/sdk.ts` is the public seam between the scan engine and every detector, including detectors outside this repository. It changes only with a versioned decision:

- An additive, optional field may ship in `evergreen.detector.v1` without a new API version.
- Any other change needs a decision record that names the affected API version, what breaks, and how existing detectors migrate.
- A breaking change uses a new `DETECTOR_API_VERSION`, so an incompatible adapter fails before it scans instead of producing unreliable findings. The decision record and the [compatibility policy](docs/DETECTORS.md#compatibility-policy) must agree.

Other public contracts follow the same shape at a lower bar: additive changes are allowed in a `v1` document, while removing or renaming a field, changing requiredness, or changing a type needs a new schema major version and a decision record ([details](docs/CAPABILITIES.md#json-output-schemas-and-policy-for-adding-fields)).

## Escalation

1. **A disagreement about a change.** Reply in the pull request or issue, summarize the options and their tradeoffs, and ask the code owner for a decision. Keep it to the technical question.
2. **Still unresolved.** Open an RFC or a decision-record pull request that states the alternatives, including the one you prefer. The maintainer decides and records the outcome. If the maintainer is a party to the disagreement, the public record and its discussion are the appeal: a later record can supersede the decision.
3. **Behavior or harassment.** Report it privately to the maintainers through [GitHub's private vulnerability reporting](https://github.com/arminazimi/evergreen/security/advisories/new), as described in the [Code of Conduct](CODE_OF_CONDUCT.md). Do not open a public issue. Maintainers review these reports promptly and keep the reporter's identity private.
4. **A security vulnerability.** Follow [SECURITY.md](SECURITY.md). Use the same private channel, include the affected version, impact, and reproduction, and never post exploit details in a public issue. You should receive an acknowledgement within seven days. If you do not, add to the existing private report rather than making it public.

A reviewer with a personal or commercial interest in an outcome says so and asks another maintainer or reviewer to decide. If there is no other reviewer, the conflict is stated in the pull request so the decision is on the record.

## Detector and rule ownership

### What ownership covers

A detector owner accounts for one ecosystem end to end: the detector and its parser in `src/detectors/`, its registry file, its fixtures and conformance tests, its public corpus entries, its page under `docs/detectors/`, and its level in `benchmarks/thresholds.json`. The owner does not have to write every change, but is the person expected to review evidence and answer questions about that ecosystem.

A rule's `provenance.reviewer` and `provenance.reviewedAt` record who last checked that rule against its sources. That is an audit trail, not a permanent ownership claim; the next review updates both fields.

### When an owner steps away

1. Anyone can report an unowned detector or rule by opening an issue with `area: detector`, the ecosystem's `eco: <name>` label, and `help wanted`, or by commenting on an existing ownership issue.
2. If the named owner has not responded to review or ownership requests for 30 days, the maintainer treats the detector as unowned and becomes its interim owner. The 30-day window is the same one [Decision 0013](docs/decisions/0013-detector-maturity.md) uses for a quality demotion.
3. The maintainer keeps an adoption issue open and reviews changes in the meantime, so the detector keeps shipping and its evidence does not go unreviewed.
4. An adopter takes ownership through a pull request that adds them to [`MAINTAINERS.md`](MAINTAINERS.md) and the matching lines in [`.github/CODEOWNERS`](.github/CODEOWNERS) and reviews the detector page, fixtures, and maturity record. Until an adopter lands, the maintainer remains the fallback owner.

### What does not change when ownership is lost

- **Maturity is evidence-based.** An unowned detector does not silently drop to `experimental`, and a detector is not promoted to attract an owner. Levels move only on the evidence in [Decision 0013](docs/decisions/0013-detector-maturity.md). A demotion is required when a full corpus run shows precision or recall below the floor for its level and the gap is still open after 30 days, whether or not the detector has an owner.
- **Evidence review is not optional.** A registry rule still needs a real reviewer and a date, and `pending-review` is still never merged. The weekly [source check](.github/workflows/sources.yml) reports rules that are stale for their `freshness.maxReviewAgeDays` window, changed at the source, or unreachable. A stale report is an invitation to re-review, not permission to delete the rule.
- **Scans stay offline.** An unowned detector is not patched by adding a network call, and it is not removed just because nobody is actively improving it.
- **CI keeps its grip.** `npm run check` still runs the detector's conformance and threshold tests, and a behavior change still requires the network-dependent public corpus run. Generated reference pages and plugin files are regenerated from their sources, never edited by hand.

### If no one adopts it

**A rule** stays while its evidence is valid. The next reviewer updates `provenance.reviewer` and `reviewedAt`. If the source has withdrawn the claim, the rule is wrong, or another rule supersedes it, remove it in a registry pull request that links the evidence, updates or deletes its fixtures, runs `npm run build:reference`, and passes `npm run check`. Removing a rule does not need a decision record; the evidence in the pull request is the record.

**A detector** is different: retiring it or narrowing what it claims is a public, expensive-to-reverse change. It needs a decision record, then one pull request that removes the detector and parser, its registry file and fixtures, its registration in `src/detectors/index.ts`, its `BUNDLED_ECOSYSTEMS` entry in `src/data-bundle.ts`, its threshold entry, and its documentation page; regenerates the generated references; and notes the change in the changelog. A detector is never removed only to make a failing corpus run or an inconvenient threshold disappear. When the detector still finds real, evidence-backed risks, keeping it shipped under an interim owner is preferred to dropping coverage.

## Changing this document

Open a pull request with the proposed change and its reason. A change to decision rights, roles, the escalation path, or the abandoned-ownership path also needs a decision record under `docs/decisions/`, because it changes how every later decision is made.
