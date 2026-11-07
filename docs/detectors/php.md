# PHP

The `php` detector reports PHP release lines that no longer receive fixes and Composer packages that are abandoned, as declared in `.php-version`, `.tool-versions`, `composer.json`, and `composer.lock`. It is **supported**: it is scored on the [public corpus](../VALIDATION.md) and held to the corpus precision and recall floors. The full reference, including every supported declaration, is [PHP detector](../compatibility/php.md).

## What it reads

| File | Declaration |
| --- | --- |
| `.php-version`, `.tool-versions` | A pinned PHP version (`7.4.33`, `php-7.4`) |
| `composer.json` | `require.php`, `config.platform.php`, and direct `require` / `require-dev` packages |
| `composer.lock` | `platform.php` and each resolved package |

## What it judges

- A pinned runtime on an end-of-life line (PHP 7.0 through 8.1), at the line that pins it.
- A `require.php` or `config.platform.php` constraint that can resolve **only** to end-of-life releases, such as `^7.3`, `~7.2`, `7.4.*`, `>=7.0 <7.3`, or `^5.4 || ^7`. It is reported against the newest line the constraint allows. The release lines compared are 7.0 through 8.5.
- A direct or resolved Composer package a reviewed rule marks abandoned (`swiftmailer/swiftmailer`, `doctrine/cache`, `fzaninotto/faker`, `sensiolabs/security-checker`, `zendframework/zend-stdlib`).

## What it does not judge

- A constraint that also allows a supported or unlisted release (`>=7.4`, `^7.4 || ^8.2`, `*`), because the project can run on a supported PHP. Evergreen reports a floor only when no allowed release is supported.
- PHP 5.x and earlier: there is no rule for those lines, so a pin or a constraint that allows only them produces nothing.
- `dev-` branches, `as` aliases, extensions (`ext-*`), and dynamic values.
- Packages without a reviewed rule, vulnerability advisories, and licenses.

## Evidence

The PHP corpus holds 108 repositories: 73 selected blind (68%), 70 expected PHP findings in 34 repositories, and 53 repositories with no expected finding of any detector. The selection rules and counts are in [Validation: PHP corpus](../validation/ecosystems.md#php-corpus).
