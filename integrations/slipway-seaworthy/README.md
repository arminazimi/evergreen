# Evergreen and Seaworthy workflow for Slipway sites

One workflow that checks dependency lifecycle with Evergreen and, when you turn it on, verifies the built site with Seaworthy.

## Setup

1. Copy [`evergreen-seaworthy.yml`](evergreen-seaworthy.yml) into `.github/workflows/` in the Slipway site repository.
2. Commit the file. The `lifecycle` job runs on every pull request and on pushes to `main`, using the Evergreen Action the same way [GITHUB_ACTION.md](../../docs/GITHUB_ACTION.md) shows, and fails on a `high` or `critical` finding. `contents: read` is enough.
3. Leave the `seaworthy` job off until Seaworthy publishes an installable CLI. It is gated on a repository variable so ordinary runs never call `npx seaworthy`.

## Turning on Seaworthy

Seaworthy is pre-alpha and is not on npm yet. When `npx seaworthy verify` works against a built `_site/`:

1. In the site repository on GitHub, open **Settings → Secrets and variables → Actions → Variables**.
2. Add a repository variable named `SEAWORTHY_ENABLED` with the value `true` (exact string).
3. Re-run the workflow (or push a commit). The `seaworthy` job will check out the site, build it with Jekyll (`bundle exec jekyll build`), then run `npx seaworthy verify ./_site`.

To turn the job off again, delete the variable or set it to anything other than `true`.

## Pins

Every `uses:` line is pinned to a full commit SHA with a release comment, matching this repository's own workflows. Before those pins were chosen, each Action was checked with:

```bash
npm run dev -- check pkg:github/<owner>/<repo>@<ref>
```

None reported end-of-life. Bump a pin the same way when you update: check the new ref, then replace the SHA and comment.
