# Ruby

The `ruby` detector reports Ruby release lines that no longer receive fixes and yanked or end-of-life gems, as declared in `.ruby-version`, `.tool-versions`, `Gemfile`, and `Gemfile.lock`. It is **supported**: it is scored on the [public corpus](../VALIDATION.md) and held to the corpus precision and recall floors. The full reference is [Ruby detector](../compatibility/ruby.md).

## What it reads

| File | Declaration |
| --- | --- |
| `.ruby-version`, `.tool-versions` | A pinned Ruby version (`2.7.8`, `ruby-3.1.4`) |
| `Gemfile` | The `ruby` directive: one pinned version, or one or more requirement strings (`'>= 2.5.0', '< 2.7.0'`) |
| `Gemfile.lock` | `RUBY VERSION` and each resolved gem |

## What it judges

- A pinned runtime on an end-of-life line (Ruby 1.9.3 through 3.2), at the line that pins it.
- A Gemfile `ruby` requirement that can resolve **only** to end-of-life releases (`~> 2.6`, `>= 2.5, < 3.2`), reported against the newest line it allows. The release lines compared are 2.0 through 3.4.
- Resolved gems a reviewed rule covers: Rails 7.2 and the scheduled end of Rails 8.0, and a yanked `json` release.

## What it does not judge

- A requirement with no upper bound (`>= 2.7`), because the project can run on a supported Ruby.
- A `ruby` directive with options (`engine:`), `latest`, `system`, or a dynamic value.
- `required_ruby_version` in a `*.gemspec`: the detector does not read gemspec files.
- Gems and Ruby lines without a reviewed rule, vulnerability advisories, and licenses.

## Evidence

The Ruby corpus holds 60 repositories: 41 selected blind (68%), 229 expected Ruby findings in 39 repositories, and 23 repositories with no expected finding of any detector. The selection rules and counts are in [Validation: Ruby corpus](../validation/ecosystems.md#ruby-corpus).
