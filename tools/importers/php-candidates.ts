/**
 * Direct Composer packages the `php-2` importer asks Packagist about.
 *
 * Packagist exposes an `abandoned` flag per package and no list of abandoned packages, so a
 * maintainer adds the direct dependencies worth watching here. A candidate that is not abandoned
 * produces no rule and is named in the importer's notes, so it can be removed. Keep the list sorted.
 */
export const PHP_PACKAGE_CANDIDATES: readonly string[] = [
  "doctrine/cache",
  "fzaninotto/faker",
  "monolog/monolog",
  "sensiolabs/security-checker",
  "swiftmailer/swiftmailer",
  "zendframework/zend-stdlib",
];
