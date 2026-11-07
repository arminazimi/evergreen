---
title: Ruby detector
---

# Ruby detector

The detector's supported declarations, what it reports, what it intentionally does not judge, and the false-positive boundaries. The matrix and policy it belongs to are on [Compatibility](../COMPATIBILITY.md).

## Ruby detector

The `ruby` detector is **supported**: its level is recorded as `stable` in `benchmarks/thresholds.json`. 60 public repositories in [Validation](../validation/ecosystems.md#ruby-corpus) cover it. Its lifecycle rules are in `registry/ruby.json` and ship in the [data bundle](../DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `.ruby-version` | One pinned version on a line by itself, such as `3.2.2`, `3.2`, `3.2.2p53`, or `ruby-3.2.2` | Blank lines and `#` comments are ignored. A file with more than one version, or any other line, produces nothing. |
| `.tool-versions` | A `ruby` line with one or more pinned versions | Every version on the line is reported. Other tools are ignored. A line with any unsupported token produces nothing. |
| `Gemfile` | The `ruby "3.2.2"` directive, and `gem "name", "version"` with a literal version | A `gem` line with a `git:` or `path:` option is skipped. Only the first literal version on a `gem` line is read. |
| `Gemfile.lock` | The `RUBY VERSION` line, and each resolved gem in the `GEM` section's `specs:` (`name (version)`) | Every resolved gem is checked, including transitive gems. `DEPENDENCIES`, `BUNDLED WITH`, and `GIT` and `PATH` specs are not read. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. Ruby, rbenv, asdf, and Bundler are never run, and nothing is fetched.

### What it reports

- A pinned Ruby release line that is past end of life, in the `.ruby-version`, `.tool-versions`, or `Gemfile` line that pins it, or the `Gemfile.lock` `RUBY VERSION` line. The bundled rules cover Ruby 3.2, 3.1, 3.0, and 2.7, citing the [Ruby maintenance branches](https://www.ruby-lang.org/en/downloads/branches/) page.
- A resolved gem in `Gemfile.lock` that a rule covers. The bundled gem rule covers `json` 2.17.1.1 (yanked), citing its [RubyGems version page](https://rubygems.org/gems/json/versions/2.17.1.1).
- A `Gemfile` gem line is reported only by a rule that covers every version of the gem. The bundled gem rule covers one version, so a `Gemfile` gem line alone produces no finding today.

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A gem finding whose rule lists usage matchers also lists the `.rb`, `.rake`, and `.ru` files that `require`, `load`, `gem`, or `autoload` that gem, and the qualified calls those matchers name (including a constant or variable assigned from that constant). The finding's impact counts those usages, and a migration packet lists the files. A runtime finding points at the pin only.

### What it intentionally does not judge

- Ruby releases and gems with no rule in `registry/ruby.json`. A missing finding is not evidence that a version is current.
- A `.ruby-version` or `.tool-versions` value of `system` or `latest`, a template, or a value that interpolates at runtime.
- Gemfile `ruby` directives with options, or a requirement that allows a supported or unlisted release, such as `ruby ">= 3.0"`. A requirement that allows only end-of-life lines (`ruby ">= 2.5", "< 2.7"`) is reported.
- Dependencies declared with no version, `git` or `path` gems, `eval_gemfile`, `gemspec`, or a dynamic value (`ENV[...]`, `#{...}`, `${...}`).
- `required_ruby_version` in a `*.gemspec`. A parser for it exists, but the detector does not read gemspec files yet, so a gemspec never produces a finding.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A runtime pin is reported whatever the project actually runs. A stale `.tool-versions` that a project no longer uses still produces a finding.
- `Gemfile.lock` findings include transitive gems, because the lockfile resolves them. A gem can be reported even though the project never imports it.
- Gem names are matched exactly as written in the file, and a rule matches only the versions its `vers` range names.
- A Bundler platform suffix in a lock version (such as `1.15.4-x86_64-linux`) is kept as written and compared as written.
- Malformed input produces no declarations from the affected unit, never a partial result, and no error is raised. For `.ruby-version`, `Gemfile`, and `Gemfile.lock` that unit is the whole file: an unterminated string in a `Gemfile`, a truncated spec in `Gemfile.lock`, or an unsupported line in `.ruby-version` yields nothing from that file. For `.tool-versions` it is the one malformed line. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.
- Source usage reads `.rb`, `.rake`, and `.ru` files. `require "json"`, `require "json/ext"`, `load "json.rb"`, `gem "json"`, `autoload :JSON, "json"`, and `Kernel.require "json"` match a rule whose module is `json`. `require_relative` of a literal is a local file and is not a gem import. A call matches when the rule names the qualified form, such as `JSON.parse`, and the source calls it with parentheses (`JSON.parse(` or `JSON::parse(`). `Parser = JSON` or `parser = ::JSON`, and an alias of that alias, counts as the same call. A call without parentheses is not matched.
- A `require`, `load`, `gem`, or `autoload` whose argument is not a string literal (a variable, interpolation, concatenation, or a method call on the string) is listed as unclassified, with its file and line. Evergreen does not guess which gem it loads. `require_relative` is never unclassified: it always names a local file. A local variable or hash key named `require`/`load`/`gem`, or a bare `load` with no argument, is not a call.
- Alias assignments are capped per file; deep or cyclic alias chains resolve to nothing. A single source line over 4,096 characters is skipped for usage scanning, matching the declaration parsers.
- Usage is not read under `vendor`, `fixtures`, `__fixtures__`, or `testdata`. Comments, ordinary strings, percent literals, heredocs, and `=begin`/`=end` blocks are not usages. A method receiver such as `JSON.load` is a call only when a matcher names it, not a file `load`.
