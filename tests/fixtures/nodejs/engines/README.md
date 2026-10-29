# Node.js `engines.node` fixtures

These fixtures lock the held-out triage boundary for concrete `engines.node` pins ([VALIDATION.md — The held-out set](../../../docs/VALIDATION.md#the-held-out-set)). After #1101, two unexpected findings were concrete EOL `engines.node` declarations that the labeller does not read; Evergreen correctly reports them. Line numbers below are 1-based. Lifecycle status comes from the reviewed `nodejs.runtime.*` rules in [`registry/nodejs.json`](../../../registry/nodejs.json), not from these fixtures.

| Fixture file | Expected case |
| --- | --- |
| `positive/package.json` | Concrete EOL `engines.node` pin `"18"` (line 5): one finding for `nodejs.runtime.eol-18`. |
| `negative/package.json` | Workspace root with no `engines.node`. The `description` (line 4) and `scripts.note` (line 9) strings that mention Node.js 18 are not runtime declarations. |
| `negative/packages/supported/package.json` | Supported `engines.node` pin `"24"` (line 5): no matching end-of-life rule, no finding. |
| `negative/packages/range/package.json` | Range-only `engines.node` `">=22"` (line 5): allows ended lines but is not a problem with the declaration, so no finding. |

The positive fixture is the intentional held-out true positive. Scanning the negative workspace must produce no `nodejs.runtime.*` findings.
