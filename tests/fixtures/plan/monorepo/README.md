# Plan monorepo fixture

A workspaces repository used by `tests/plan-e2e.test.ts` to prove migration waves keep conflicting tasks apart.

| Area | Contents | Why |
| --- | --- | --- |
| Shared lockfile | Deprecated npm packages across `packages/api`, `packages/web`, and `packages/worker`, resolved in the root `package-lock.json` | Tasks that share the lockfile must land in different waves |
| Separate package | `services/billing` with its own `package-lock.json` | Disjoint from the root lockfile, so it can share a wave with one shared-lockfile task |
| Workflows | Three GitHub Actions workflows with unsupported action pins | Each touches only its own workflow file, so they share waves with each other and with package tasks |

Do not run `npm install` in this fixture.
