# Evergreen onboarding GitHub App

On install (or when repositories are added to an install), this app opens one pull request on the `evergreen/onboarding` branch. The pull request adds the SHA-pinned Evergreen workflow and `.evergreen.json` from [`src/onboarding.ts`](../../src/onboarding.ts), and merges the README badge snippet. If `.github/workflows/evergreen.yml` is already present, the app does nothing for that repository.

The handler is **stateless**: it verifies the webhook signature, uses a short-lived installation token, writes proposed files through the GitHub API, and keeps no repository contents after the request ends. Scans still run in the repository's own Actions.

## Permissions

Recorded in [`manifest.json`](manifest.json). Minimal set:

| Permission | Access | Why |
| --- | --- | --- |
| Contents | Read and write | Create the onboarding branch and files |
| Pull requests | Read and write | Open the onboarding pull request |
| Metadata | Read | Required for repository identity |

Hosting and the final permission decision track issue #1641. Until that decision lands, run this as a small Node process you control; do not store the private key in the repository.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_APP_ID` | yes | Numeric GitHub App id |
| `GITHUB_APP_PRIVATE_KEY` | yes | PEM private key (`\n` escapes allowed) |
| `GITHUB_WEBHOOK_SECRET` | yes | Webhook secret for `X-Hub-Signature-256` |
| `PORT` | no | Listen port (default `3000`) |

## Run

From the repository root after `npm run build`:

```bash
node integrations/github-app/server.mjs
```

`POST /webhook` accepts GitHub deliveries. `GET /healthz` returns `ok`.

## Local webhook replay

Proves the install path without calling GitHub:

```bash
npm run build --silent
node integrations/github-app/replay.mjs
```

The replay signs [`fixtures/installation.created.json`](fixtures/installation.created.json), drives the handler against an in-memory GitHub stand-in, and prints the pull request that would open (branch `evergreen/onboarding`, workflow + config files).

## Remove Evergreen after install

Close the pull request, or after merge delete `.github/workflows/evergreen.yml` and `.evergreen.json`, remove the badge line from `README.md`, and uninstall the app from the repository's settings.
