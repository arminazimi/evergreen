---
title: PHP detector
---

# PHP detector

The detector's supported declarations, what it reports, what it intentionally does not judge, and the false-positive boundaries. The matrix and policy it belongs to are on [Compatibility](../COMPATIBILITY.md).

## PHP detector

The `php` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories in [Validation](../validation/ecosystems.md#php-corpus) cover it. Its lifecycle rules are in `registry/php.json` and ship in the [data bundle](../DATA.md).

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `.php-version` | One pinned version on a line by itself, such as `7.4.33`, `7.4`, or `php-7.4.33` | Blank lines and `#` comments are ignored. A file with more than one version, or any other line, produces nothing. The `php-` prefix is stripped before matching. |
| `.tool-versions` | A `php` line with one or more pinned versions | Every version on the line is reported. Other tools are ignored. A line with any unsupported token produces nothing. |
| `composer.json` | `require.php`, `config.platform.php`, and direct packages in `require` / `require-dev` (`vendor/name` with a literal constraint) | Extensions (`ext-*`), floating `*`, dynamic `${…}` values, `extra.php`, and other `config.platform.*` keys are ignored. |
| `composer.lock` | `platform.php`, and each resolved package in `packages` / `packages-dev` (`name` and `version`) | Every resolved package is checked, including transitive and `require-dev` packages. `platform-dev`, `plugin-api-version`, and non-`php` platform keys are not read. An `abandoned` flag is parsed and is not a finding by itself. |

Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. PHP, phpenv, asdf, and Composer are never run, and nothing is fetched.

### What it reports

- A pinned PHP release line that is past end of life, in the `.php-version`, `.tool-versions`, `composer.json` `config.platform.php`, or `composer.lock` `platform.php` line that pins it, or an exact `require.php` version that matches a rule. The bundled rules cover PHP 8.1, 8.0, and 7.4, citing the [PHP unsupported branches](https://www.php.net/eol.php) page. A requirement range such as `>=7.4` or `^8.2` is not a pin and produces no runtime finding.
- A `composer.json` package line only when a rule covers every version of that package (`vers:composer/*`). The bundled abandoned-package rules cover `swiftmailer/swiftmailer` and `zendframework/zend-stdlib`, citing Packagist and the Symfony / Laminas announcements.
- A resolved package in `composer.lock` when a rule's `vers` contains that version. Abandoned-package rules match any resolved version of the named package.

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A package finding whose rule lists usage matchers also lists the `.php` files that `require` / `include` (and `_once`) that package, and the qualified calls those matchers name (`Class::method` and `new Class`). The finding's impact counts those usages, and a migration packet lists the files. A runtime finding points at the pin only.

### What it intentionally does not judge

- PHP releases and Composer packages with no rule in `registry/php.json`. A missing finding is not evidence that a version is current.
- A `.php-version` or `.tool-versions` value of `system` or `latest`, a template, or a value that interpolates at runtime.
- Composer `require.php` constraints that are not concrete versions (`>=7.4`, `^8.2`, `~8.1.0`, and similar ranges).
- Extensions (`ext-*`), floating `*` package constraints, `git` / `path` repositories, and dynamic `${…}` values in `composer.json`.
- An `abandoned` flag in `composer.lock` without a matching lifecycle rule. Composer may mark a package abandoned; Evergreen reports it only when a reviewed rule names that package.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A runtime pin is reported whatever the project actually runs. A stale `.tool-versions` or `config.platform.php` that a project no longer uses still produces a finding.
- `composer.lock` findings include transitive packages, because the lockfile resolves them. A package can be reported even though the project never imports it.
- Package names are matched exactly as written in the file, and a rule matches only the versions its `vers` range names.
- Malformed input produces no declarations from the affected unit, never a partial result, and no error is raised. For `.php-version`, `composer.json`, and `composer.lock` that unit is the whole file. For `.tool-versions` it is the one malformed line. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.
- Source usage reads `.php` files. Quoted `require` / `include` (and `_once`) paths match a rule whose module is that path (a trailing `.php` is stripped). A call matches when the rule names the qualified form, such as `Swift_Mailer::newInstance` or `new Zend\Stdlib\Parameters`. Usage is not a PHP AST: it is regex-based matching, so unusual formatting can miss a call or require.
- A `require` or `include` whose argument is not a string literal (a variable, concatenation, or a method call on the string) is listed as unclassified, with its file and line. Evergreen does not guess which package it loads. `new $class` and `$class::method()` are unclassified for the same reason.
- Usage is not read under `vendor`, `fixtures`, `__fixtures__`, or `testdata`. Comments and ordinary strings are not usages. A single source line over 4,096 characters is skipped for usage scanning, matching the declaration parsers.
