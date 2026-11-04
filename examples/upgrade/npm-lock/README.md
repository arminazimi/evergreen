# npm lockfile upgrade example

This `package-lock.json` declares `sharp@0.30.7` with `engines.node ">=14.0.0 <17"`, so a move to Node.js 22 is blocked by that entry. The check reads the lockfile only: nothing is installed and the lockfile is not modified.

```bash
node dist/tools/examples.js upgrade/npm-lock upgrade-check --to nodejs@22
```

Expected verdict: `blocked`, with the evidence `engines.node: >=14.0.0 <17` at the line of the `engines` key.
