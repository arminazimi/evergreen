# Elixir and Mix

The `elixir` detector reports Elixir and Erlang/OTP releases that no longer receive security updates, and Hex packages that Hex marks retired, as declared in `.tool-versions`, `mix.exs`, and `mix.lock`. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/elixir.json` and ship with the package (see [Lifecycle data](../DATA.md)).

## What it reads

| File | Declaration |
| --- | --- |
| `.tool-versions` | An `elixir` line (including an asdf `1.14.5-otp-25` form) and an `erlang` line |
| `mix.exs` | The project `elixir:` constraint, and each direct Hex dep written as `{:name, "constraint", …}` |
| `mix.lock` | The resolved version of each Hex package (`{:hex, :name, "version", …}`) |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `deps`, `_build`, `.elixir_ls`, `fixtures`, `__fixtures__`, and `testdata`. Elixir, Erlang, asdf, and Mix are never run, and nothing is fetched.

## What it reports

- An Elixir version pinned exactly in `.tool-versions` or as an exact `elixir:` value in `mix.exs` that falls outside the five most recent minor branches in the [Elixir security policy](https://github.com/elixir-lang/elixir/security/policy). Bundled rules cover Elixir 1.14 and 1.15. Reported at **high** severity.
- An Erlang/OTP version pinned in `.tool-versions` (including the major taken from an asdf `elixir …-otp-N` suffix) that falls outside the last three OTP majors in the [Erlang/OTP security policy](https://github.com/erlang/otp/security/policy). Bundled rules cover OTP 25 and 26. Reported at **high** severity.
- A direct Hex dependency in `mix.exs`, or a Hex package resolved in `mix.lock`, on a package that Hex marks retired, at the line that declares it. Bundled rules cover `fennec` (renamed to `mongooseice`).

Each finding carries its rule's source, replacement, migration steps, and verification commands.

## How versions are matched

- An exact version (a `.tool-versions` pin, an exact `mix.exs` `elixir:` value, or a resolved `mix.lock` package) uses the first rule whose `vers` range contains it. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A constraint with an operator (`~> 1.14`, `>= 1.14`) admits versions outside any single release line, so it is matched only against a rule that covers every version of that package, which is how a retired Hex package is recorded. It is never reported as an old Elixir runtime, because the project may build with a newer one.
- Packages are matched as `pkg:hex/<name>`, Elixir as `pkg:generic/elixir`, and Erlang/OTP as `pkg:generic/erlang`.

## What it intentionally does not judge

- `elixir:` ranges in `mix.exs`, as described above: `~> 1.14` is not a pin.
- `system`, `latest`, empty values, and interpolated strings.
- Git, path, and in_umbrella Mix dependencies.
- Vulnerability advisories, license policy, and whether a newer version of a package exists.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters) produce nothing, not partial results.

## Known limits and false-positive boundaries

- A retired Hex package is reported at any version when the rule covers every version, because the notice is about the package, not a release. The package may still resolve; Evergreen reports that Hex marks it retired.
- `mix.exs` is read line by line, not as an Elixir AST. A dep or `elixir:` value that spans lines, or uses a non-string constraint, is not matched.
- `mix.lock` reads Hex entries only. Git and path lock entries produce no finding.
- Monorepos are scanned file by file; findings in umbrella children are reported like any other.
