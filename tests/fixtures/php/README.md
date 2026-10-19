# PHP fixtures

These fixtures define the parser boundary for PHP declarations in [epic #45](https://github.com/arminazimi/evergreen/issues/45). The scope is `require.php`, `config.platform.php`, and direct packages in `composer.json`; resolved package versions and `abandoned` flags in `composer.lock`; and the pinned runtime in `.php-version` and `.tool-versions`. Line numbers below are 1-based. The versions are parser examples only: **they do not claim that any PHP release or package is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source ([epic #45](https://github.com/arminazimi/evergreen/issues/45), “Scope” and “Non-goals”).

| Fixture file | Expected case |
| --- | --- |
| `positive/composer.json` | `require.php` `>=7.4` (line 4), direct packages `monolog/monolog` `2.9.1` (line 5) and `symfony/http-foundation` `5.4.0` (line 6), `require-dev` package `phpunit/phpunit` `9.6.0` (line 9), and `config.platform.php` `7.4.33` (line 13). |
| `positive/composer.lock` | Resolved versions `monolog/monolog` `2.9.1` (line 5, `abandoned` false on line 6), `old/abandoned` `1.0.0` (line 10, `abandoned` replacement on line 11), `symfony/http-foundation` `5.4.0` (line 15), `phpunit/phpunit` `9.6.0` in `packages-dev` (line 21), and platform `php` `7.4.33` (line 25). `plugin-api-version` (line 28) is Composer's API version, not a package. |
| `positive/.php-version` | A plain pinned runtime, `7.4.33` (line 1). |
| `positive/.tool-versions` | The `php` entry `7.4.33` on line 2; the `nodejs` entry on line 1 is not a PHP declaration. |
| `negative/composer.json` | Prose in `description` (line 3), floating `ext-json` `*` (line 5), dynamic `${MONOLOG_VERSION}` (line 6), floating `*` package (line 7), `extra.php` lookalike (line 10), and `config.platform.ext-gd` (line 15) with no `require.php` or `config.platform.php`: no declarations. |
| `negative/composer.lock` | Empty `packages` / `packages-dev` (lines 2–3), unrelated platform `ext-json` (line 5), and dynamic `platform-dev.php` `${PHP_VERSION}` (line 8): no resolved package or PHP platform pin. |
| `negative/.php-version` | A commented-out version (line 1) and the `system` keyword (line 2): nothing is pinned to a release, so no declaration. |
| `negative/.tool-versions` | A comment (line 1), the unrelated `nodejs` key (line 2), the floating value `latest` (line 3), and the dynamic value `${PHP_VERSION}` (line 4) produce no PHP declaration. |
| `zero/composer.json` | `require.php` `>=8.3` (line 4), direct package `monolog/monolog` `3.8.0` (line 5), and `config.platform.php` `8.3.12` (line 9): valid declarations, no lifecycle findings. |
| `zero/composer.lock` | Resolved `monolog/monolog` `3.8.0` (line 5, `abandoned` false on line 6) and platform `php` `8.3.12` (line 11): valid declarations, no lifecycle findings. |
| `zero/.php-version` | The current pinned runtime `8.3.12` (line 1): a valid declaration, no lifecycle finding. |
| `zero/.tool-versions` | The `php` entry `8.3.12` (line 2): a valid declaration, no lifecycle finding. |
| `malformed/composer.json` | Truncated JSON (unterminated string on line 5): no partial declarations, no error. |
| `malformed/composer.lock` | Truncated JSON (ends after `"abandoned":` on line 6): no partial declarations, no error. |
| `malformed/.php-version` | An empty file: no declaration, no error. |
| `malformed/.tool-versions` | `php` with no version (line 1): no declaration, no error. |

The zero fixture is a valid project whose versions are current, so it yields no lifecycle findings. Unclassified or lookalike values in the negative fixtures are not findings. Malformed fixtures are handled without an error or partial declarations.
