# `strategy.matrix` Node.js fixtures

These fixtures lock the boundary recorded in issue #1689 and
[VALIDATION.md](../../../../docs/VALIDATION.md#the-held-out-set): when a
`actions/setup-node` step reads `node-version: ${{ matrix.node }}`, Evergreen
follows the reference to the literal list under `strategy.matrix.node` and
reports each end-of-life entry at the line that holds that entry. The workflow
is parsed, never evaluated. Line numbers below are 1-based.

## Expected findings

| Fixture file | Line | Rule | Why |
| --- | --- | --- | --- |
| `positive/.github/workflows/matrix-node.yml` | 9 | `nodejs.runtime.legacy` | `block-list` matrix entry `14` is end-of-life. |
| `positive/.github/workflows/matrix-node.yml` | 11 | `nodejs.runtime.eol-20` | `block-list` matrix entry `20` is end-of-life. |
| `positive/.github/workflows/matrix-node.yml` | 20 | `nodejs.runtime.legacy` | `flow-list` matrix row `[14, 24]`: the entry `14` is reported at the row's own line; `24` on the same row is supported. |

The supported entry `24` at line 10 and the `actions/setup-node@v6` references
produce no finding.

## Negative lookalikes

| Fixture file | Line | Expected case |
| --- | --- | --- |
| `negative/.github/workflows/matrix-node.yml` | 7 | Comment naming Node 14 and `actions/setup-node@v2` is ignored; comments are not read. |
| `negative/.github/workflows/matrix-node.yml` | 11 | Comment naming `node-version: 14` and `16` is ignored; comments are not read. |
| `negative/.github/workflows/matrix-node.yml` | 17 | Floating `node-version: latest` is parsed, unclassified, and produces no finding. |
| `negative/.github/workflows/matrix-node.yml` | 22, 26 | `node: ${{ fromJSON(...) }}` is not a literal list, so `node-version: ${{ matrix.node }}` is parsed, unclassified, and produces no `nodejs.runtime.*` finding. |
