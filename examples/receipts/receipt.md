<!-- evergreen-receipt -->
## Evergreen receipt: Partially resolved

| Resolved | Remaining | Introduced |
| --- | --- | --- |
| 1 | 4 | 0 |

### Resolved

| Severity | Finding | Location |
| --- | --- | --- |
| high | request is deprecated | package\.json:8 |

### Remaining

| Severity | Finding | Location |
| --- | --- | --- |
| high | Unsupported actions/checkout runtime | \.github/workflows/ci\.yml:9 |
| medium | Node\.js 18 is end\-of\-life | package\.json:5 |
| medium | Node\.js 19 is end\-of\-life | package\.json:5 |
| medium | Node\.js 20 is end\-of\-life | package\.json:5 |

### Introduced

_None._

### Suggested commands

```
git diff --check  # Validate the edited workflow diff.
node --version  # Confirm the active Node.js runtime is supported.
npm run build --if-present  # Verify imports, types, and the build remain valid.
npm run test --if-present  # Run HTTP behavior and repository tests when defined.
```
