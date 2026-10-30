---
title: Migration plans
---

# Migration plans

`evergreen plan` turns a scan into waves of independent migration tasks. Each task names the files it is expected to edit (its touch set), a suggested branch, and the finding to migrate. Tasks in the same wave never share a touched path, so a host can start them as parallel agent sessions without two agents editing the same file.

```bash
npx evergreen-deprecation plan examples/demo
npx evergreen-deprecation plan examples/demo --json
npx evergreen-deprecation plan examples/demo --wave 0
```

The JSON form is the versioned `evergreen.plan.v1` document. The local MCP tool `plan_migrations` returns the same object. Evergreen builds the plan and stops: it does not create branches, worktrees, or agent sessions, and it never runs a migration command.

## Touch sets

A task's touch set is the repository-relative paths a migration for that finding is expected to change: the finding's declaration file, every usage the scan recorded, and — for a dependency finding — the lockfile that resolves the same manifest. Two findings that share a lockfile therefore conflict, even when their declaration lines differ.

## Waves

Waves are a greedy colouring of those touch sets. Tasks are ordered by severity (highest first) then id; each task joins the first wave that does not already hold a conflicting path, or starts a new wave when every existing wave conflicts. Waves run in ascending index order. Inside one wave the tasks are independent, so a coordinating host can hand them out at the same time.

## Dispatch without Evergreen running anything

The example at [`examples/plan-dispatch/dispatch.mjs`](../examples/plan-dispatch/dispatch.mjs) reads `evergreen plan --json` from stdin and, for each task, prints a `git worktree add` command plus the name of the `migrate-finding` prompt. It prints only; it never runs a command.

```bash
npm ci
npm run build
node dist/src/cli.js plan examples/demo --json | node examples/plan-dispatch/dispatch.mjs
```

A host that wants parallel sessions creates each printed worktree itself, then runs the `migrate-finding` prompt in that tree with the task's finding id. See [Local MCP server](MCP.md) for the prompt and [Migration packets](MIGRATION_PACKETS.md) for the context each session receives.
