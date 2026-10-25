---
title: Git hooks
---

# Git hooks

`evergreen init --hooks` installs a Git pre-push hook that scans the repository before every push and blocks it when a finding reaches a severity you choose. It uses only local files; the scan never uses the network.

```bash
npx evergreen-deprecation init --hooks --dry-run   # show the hook first
npx evergreen-deprecation init --hooks             # install it
npx evergreen-deprecation init --agents --hooks    # also add the agent instructions
```

## What the hook does

It runs `evergreen-deprecation scan . --fail-on <severity> --format compact`. The default gate is `high`; choose another with `--fail-on low|medium|high|critical`. Only findings at or above the gate block the push (exit code 1). If Evergreen is not installed in the project, or a scan fails for another reason, the push is not blocked.

`scan --fail-on <severity|none>` works on its own too, for example in CI. Without it, `scan` exits 0 as before.

## Safe to run again

The hook holds one block between `# >>> evergreen pre-push >>>` and `# <<< evergreen pre-push <<<`. Running `init --hooks` again leaves a current block unchanged, and rewrites only that block when the gate changes. It creates `.git/hooks/pre-push` (honoring `core.hooksPath`) as an executable script.

Evergreen never overwrites a hook it did not write. If `pre-push` already exists without the block, the command stops and prints the line to add to it yourself.

## Husky and Lefthook

When a `.husky/` folder or a `lefthook.yml` exists, that tool owns the hooks, so Evergreen writes nothing and prints what to add:

```bash
# .husky/pre-push
npx --no-install evergreen-deprecation scan . --fail-on high --format compact
```

```yaml
# lefthook.yml
pre-push:
  commands:
    evergreen:
      run: npx --no-install evergreen-deprecation scan . --fail-on high --format compact
```

## Bypass

```bash
git push --no-verify          # skip every hook for this push
EVERGREEN_SKIP=1 git push     # skip only Evergreen
```

To remove the hook, delete the marked block (or the file, if it holds only that block).
