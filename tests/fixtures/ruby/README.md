# Ruby fixtures

These fixtures define the parser boundary for Ruby declarations in [epic #54](https://github.com/arminazimi/evergreen/issues/54). The scope is the pinned runtime in `.ruby-version` and `.tool-versions`, the `ruby` directive and direct gems in a `Gemfile`, resolved gems and `RUBY VERSION` in `Gemfile.lock`, and `required_ruby_version` in a `*.gemspec`. Line numbers below are 1-based. The versions are parser examples only: **they do not claim that any Ruby release or gem is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source ([epic #54](https://github.com/arminazimi/evergreen/issues/54), “Scope” and “Non-goals”).

| Fixture file | Expected case |
| --- | --- |
| `positive/.ruby-version` | A plain pinned runtime, `3.2.2` (line 1). |
| `positive/.tool-versions` | The `ruby` entry `3.2.2` on line 2; the `nodejs` entry on line 1 is not a Ruby declaration. |
| `positive/Gemfile` | The `ruby` directive `3.2.2` on line 3, the direct gem `rack` `2.2.8` (line 5), and the direct gem `rake` `13.0.6` inside a `group` block (line 8). |
| `positive/Gemfile.lock` | Resolved gem versions `rack 2.2.8` (line 4) and `rake 13.0.6` (line 5), plus the `RUBY VERSION` `3.2.2p53` (line 15). The `DEPENDENCIES` lines 11–12 are requirements, not resolved versions; `BUNDLED WITH` line 18 is Bundler's own version. |
| `positive/example.gemspec` | `required_ruby_version = ">= 3.1.0"` (line 7). |
| `negative/.ruby-version` | A commented-out version (line 1) and the `system` keyword (line 2): nothing is pinned to a release, so no declaration. |
| `negative/.tool-versions` | A comment (line 1), the unrelated `nodejs` key (line 2), the floating value `latest` (line 3), and the dynamic value `${RUBY_VERSION}` (line 4) produce no Ruby declaration. |
| `negative/Gemfile` | Commented-out `ruby` and `gem` lines (3–4), the dynamic `ruby ENV[...]` (line 6), the dynamic gem (line 8), a floating gem with no version (line 9), `git` and `path` gems with no version (lines 10–11), a dynamic gem inside a group (line 14), `eval_gemfile` (line 17), and `gemspec` (line 18) produce no version declarations. |
| `negative/Gemfile.lock` | The `specs:` section is empty (lines 3–4), so there are no resolved gems. `DEPENDENCIES` requirement ranges (lines 9–10), the dynamic `RUBY VERSION` (line 13), and `BUNDLED WITH` (line 16) produce no declarations. |
| `negative/example.gemspec` | A commented-out pin (line 1), prose that mentions the key (line 5), `add_dependency` and `add_development_dependency` (lines 6–7, outside this detector's gemspec scope), a dynamic `required_ruby_version` (line 8), and a metadata key that contains the words (line 9) produce no declarations. |
| `zero/.ruby-version` | The current pinned runtime `3.3.0` (line 1): a valid declaration, no lifecycle finding. |
| `zero/.tool-versions` | The `ruby` entry `3.3.0` (line 2): a valid declaration, no lifecycle finding. |
| `zero/Gemfile` | The `ruby` directive `3.3.0` (line 3) and the direct gem `rake` `13.2.1` (line 5): valid declarations, no lifecycle findings. |
| `zero/Gemfile.lock` | The resolved gem `rake 13.2.1` (line 4) and `RUBY VERSION` `3.3.0p0` (line 13): valid declarations, no lifecycle findings. |
| `zero/example.gemspec` | `required_ruby_version = ">= 3.1.0"` (line 5): a valid declaration, no lifecycle finding. |
| `malformed/.ruby-version` | An empty file: no declaration, no error. |
| `malformed/.tool-versions` | `ruby` with no version (line 1): no declaration, no error. |
| `rails/eol/Gemfile.lock` | Rails 7.2.4: the recently retired release series. |
| `rails/scheduled/Gemfile.lock` | Rails 8.0.5.1: a supported series with an announced security-support deadline. |
| `rails/supported/Gemfile.lock` | Rails 8.1.4: the current supported series, so no lifecycle finding. |
| `malformed/Gemfile` | An unterminated string (line 2) and an unterminated call (line 3): no partial declarations, no error. |
| `malformed/Gemfile.lock` | A truncated version (line 4): no partial declarations, no error. |
| `malformed/broken.gemspec` | An unterminated string (line 3): no partial declarations, no error. |

The zero fixture is a valid project whose versions are current, so it yields no lifecycle findings. Unclassified or lookalike values in the negative fixtures are not findings. Malformed fixtures are handled without an error or partial declarations.
