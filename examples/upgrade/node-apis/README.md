# Node.js core APIs example

This project can move to Node.js 22 but not to Node.js 24: `app.js` calls `util.isString`, which Node.js 23 removed, and `util.isArray`, which is deprecated.

```bash
node dist/tools/examples.js upgrade/node-apis upgrade-check --to nodejs@24
```

```text
nodejs@24: blocked (1 blockers, 1 warnings, 0 unknown)
app.js:4  util.isString  Node.js removed util.isString() (DEP0045 to DEP0058 group, end-of-life since v23.0.0), so calls throw a TypeError.  [rule: nodejs.symbol.util.isstring]
app.js:5  util.isArray  Node.js deprecates util.isArray() (DEP0044): documentation-only since v4.0.0, runtime warning since v22.0.0.  [rule: nodejs.symbol.util.isarray]
```

The removed call is a blocker at its exact line and the deprecated one is a warning, each with the symbol rule id behind it. Switching the target to `nodejs@22` reports only the warning for `util.isArray`, because Node.js removes `util.isString` in 23.

Nothing here is executed: `upgrade-check` reads the files and the bundled lifecycle rules only.
