# VEX statements

When a dependency advisory does not affect Evergreen, record why here. Every release turns these files into `vex.cdx.json`, a signed CycloneDX 1.5 VEX file attached next to the SBOM (see [docs/RELEASING.md](../../docs/RELEASING.md)).

One file per advisory and package, named for them, for example `GHSA-xxxx-xxxx-xxxx-minimatch.json`:

```json
{
  "id": "GHSA-xxxx-xxxx-xxxx",
  "package": "minimatch",
  "versions": ["3.1.2"],
  "state": "not_affected",
  "justification": "code_not_reachable",
  "detail": "Evergreen only calls the matcher with patterns it ships; the vulnerable path needs attacker-supplied patterns.",
  "source": { "name": "GitHub Advisory Database", "url": "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" }
}
```

- `state` is always `not_affected`. An affected dependency is fixed, not documented here.
- `justification` is a CycloneDX value: `code_not_present`, `code_not_reachable`, `requires_configuration`, `requires_dependency`, `requires_environment`, `protected_by_compiler`, `protected_at_runtime`, `protected_at_perimeter`, or `protected_by_mitigating_control`.
- `detail` is the reason, in plain words, that a reviewer can check.
- `versions` is optional; leave it out to cover every shipped version of the package.
- A statement whose package is not in a release's SBOM is left out of that release's file.

`npm run check` validates these files.
