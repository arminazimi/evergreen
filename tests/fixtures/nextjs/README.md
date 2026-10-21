# Next.js fixtures

These fixtures exercise the Next.js lifecycle rules in `registry/npm.json`, which the npm detector matches against the `next` package. The rules come from the [Next.js support policy](https://nextjs.org/support-policy). Line numbers below are 1-based. A lifecycle finding needs a reviewed rule with an authoritative source (see [Lifecycle rules](../../../docs/RULES.md#evidence-policy)).

Next.js 16 is Active LTS and Next.js 15 is in Maintenance LTS at the time of writing, so the fixtures use 14.x as the unsupported example and 16.x as the supported one. The per-major dates and coverage are tested in `tests/nextjs.test.ts`.

| Fixture file | Expected case |
| --- | --- |
| `positive/package.json` | `next` `14.2.15` declared in `dependencies` (line 5): one finding for `npm.package.next.14.support-end`. |
| `positive/package-lock.json` | Resolved `next` `14.2.15` (line 15) confirms the declared version. It is read for the finding's summary and produces no finding by itself. |
| `negative/package.json` | Floating `next` `latest` (line 5) has no version range, so no declaration. Lookalike packages `next-auth` (line 6), `@next/codemod` (line 10), and `eslint-config-next` (line 11) are different packages. |
| `negative/package-lock.json` | Resolved `next` `16.0.1` is supported, and the lookalike packages resolve to versions that no Next.js rule covers. The floating declaration in `package.json` is not a version, so the lockfile does not create a finding. |
| `zero/package.json` | `next` `^16.0.1` (line 5), the Active LTS major: a valid declaration with no lifecycle finding. |
| `zero/package-lock.json` | Resolved `next` `16.0.1` (line 15): no lifecycle finding. |
| `malformed/package.json` | `next` `not-a-version` (line 5) is not a version range, so no declaration. |
| `malformed/yarn.lock` | Garbage lines and a `next` entry with an unparseable version (lines 1–3): no resolved version, no error. |

The zero fixture is a valid, current project whose versions are supported, so it yields no lifecycle findings. Unsupported or lookalike values in the negative fixtures are not findings. Malformed input is handled without an error.
