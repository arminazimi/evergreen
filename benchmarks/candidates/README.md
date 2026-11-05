# Offline corpus candidate finder

Implements the discovery step of [decision 0030](../../docs/decisions/0030-corpus-selection-and-200-target.md).
After building, one command queries a saved public-source snapshot and writes up to **300 candidates for
all 23 ecosystems**, with a full commit SHA and the selection rule's result for each:

```sh
node dist/benchmarks/candidates/cli.js sources.json candidates.json
```

This is maintainer corpus tooling, separate from scans and labeling. No code in this directory has network
or process access. It does not execute repository code, scan candidates, install dependencies, or change the
reviewed corpus. The result is eligibility under decision 0030, **not an Evergreen lifecycle finding**.
Missing evidence remains a failed check; a missing commit is explicitly `null`, never a mutable branch pin.
No output from this tool counts toward the reviewed 200-repository target.

## Prepare the public-source snapshot separately

The issue forbids adding network access even to the new discovery path. Accordingly, discovery consumes
saved GitHub search/repository/commit/tree responses; acquisition remains a separate maintainer activity.
A fresh checkout does not contain 6,900 exported repositories. An empty or capped export produces an honest
shortfall, not invented candidates. Tests exercise a full 300-candidate batch for every bucket using synthetic
metadata; those fixtures are not public corpus evidence.

1. Run `node dist/benchmarks/candidates/cli.js --plan` **before searching** and save the plan. It lists ordered
   input forms and version-neutral GitHub code searches for each bucket. Search each form and both size bands
   (0–5,000 and 5,001–50,000 KB); preserve the query, public search URL, cap, and incomplete-results flag.
   Code search wildcards/qualifiers vary by search interface: use the displayed filename as a discovery aid
   and record the actual query. Broaden to documented input forms if needed, recording the limitation.
   Do not search for deprecated versions, known findings, or scores. Language alone is not eligibility.
2. Save the repository metadata (`GET /repos/{owner}/{repo}`), resolve its default branch with
   `GET /repos/{owner}/{repo}/commits/{default_branch}`, then save the recursive tree at the returned tree SHA
   (`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1`). Record the resolved branch as `ref`.
   Never substitute `updated_at` for the commit's committer date. Resolve every pin once for the frozen batch.
3. Read the license **at that commit**, identify the SPDX license and its OSI approval, and review whether it
   covers the input files. Record that review below; the tool never infers legal coverage from GitHub's
   repository-level license guess. Missing or ambiguous evidence is `null` pending review. A failed fetch is
   also `null` for the commit or tree; retain the repository so its failure is visible.
4. Wrap these saved responses in the format below. Keep `sources.json` alongside `candidates.json` in the batch
   record, committing both before any scan. Preserve the original responses for audit. Do not vendor source
   code. Export search hits before filtering; rejected candidates belong in the report too.

Minimal source snapshot (GitHub's additional response fields are accepted and ignored):

```json
{
  "schemaVersion": "evergreen.candidate-sources.v1",
  "discoveredAt": "2026-11-05",
  "sources": [{
    "ecosystem": "node",
    "query": "filename:package.json fork:false",
    "url": "https://github.com/search?q=filename%3Apackage.json&type=code",
    "limit": 1000,
    "incomplete": false,
    "items": [{
      "repository": {
        "id": 123,
        "full_name": "owner/project",
        "private": false,
        "fork": false,
        "archived": false,
        "mirror_url": null,
        "size": 5000,
        "default_branch": "main"
      },
      "ref": "main",
      "commit": {
        "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "commit": {
          "committer": { "date": "2026-11-01T00:00:00Z" },
          "tree": { "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
        }
      },
      "tree": {
        "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "truncated": false,
        "tree": [
          { "path": "package.json", "type": "blob" },
          { "path": "LICENSE", "type": "blob" }
        ]
      },
      "licenseReview": {
        "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "path": "LICENSE",
        "spdxId": "MIT",
        "osiApproved": true,
        "coversInputs": true,
        "reviewer": "maintainer"
      }
    }]
  }]
}
```

The names and SHAs above are illustrative, not acquired evidence.

## Selection and limitations

- UTC discovery date freezes the 24-calendar-month activity cutoff (inclusive). Future commits fail.
- Public, nonfork, unarchived, nonmirror projects at most 50,000 KB qualify only with a default-branch pin,
  complete tree matching that commit, reviewed license file in that tree, and a supported input filename.
  Filename presence is discovery evidence; reviewers still confirm actual input structure and license coverage.
- Form order comes from `profiles.ts`; size order is small then medium. Assign overlapping forms to the first
  match, sort lowercase repository names inside each stratum, and walk strata round-robin. Inspect the first
  300 distinct candidates regardless of eligibility; failures do not cause replacement with better-scoring
  repositories. Empty strata, excluded duplicate hits, remaining hits, search limits, and shortfalls are saved.
- Within a bucket, the first exported record per GitHub repository ID wins (including renamed projects).
  Keep export order frozen and resolve each ID once: duplicate records are listed with their pins for review.
  Across buckets, the first eligible membership in the declared bucket order owns the primary assignment;
  subsequent memberships are ineligible and name that reason. This deterministic default is visible before
  scanning and may be reviewed by the maintainer before freezing the batch.
- `shortfall` measures missing candidates out of 300, while `eligible` reports those passing all checks.
  Insufficient eligible projects remain a shortfall for the later 200-project reviewed target. Never treat a
  search cap, missing form, or truncated tree as evidence that the ecosystem has no more projects.
- The plan covers common input filenames; YAML content-dependent inputs (plain Kubernetes manifests, runtime
  container declarations, database resources) need a broader recorded search and human structure review.
  No claim of complete search coverage or independent ground truth is made. Applications/libraries and
  maintainer diversity remain part of the recorded human selection review from decision 0030.
- Malformed snapshots (bad SHAs, paths, dates, bucket names, missing required metadata) fail without writing
  an output report. Operational fetch failures use explicit null evidence and are retained as failed checks.

Commit the frozen plan and sources with the report. Run scans and independent labeling only afterwards;
poor accuracy, parser failures, and zero findings never justify dropping the frozen selections.
