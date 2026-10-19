---
title: "PHP 7.4 is end-of-life — dates, impact, migration"
description: "The PHP unsupported branches page lists the PHP 7.4 branch as end of life on 2022-11-28; the branch no longer receives security or bug fixes from the PHP project."
canonical_url: "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.4.html"
---

# PHP 7.4 is end-of-life

The PHP unsupported branches page lists the PHP 7.4 branch as end of life on 2022-11-28; the branch no longer receives security or bug fixes from the PHP project.

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `php` |
| Component | `pkg:generic/php` |
| Affected versions | `vers:semver/>=7.4.0\|<8.0.0` |
| Date from the source | 2022-11-28 |
| Replacement | PHP 8.3 or later |
| Evidence last seen | 2026-10-19 |
| Reviewed | 2026-10-19 by arminazimi |
| Review due | 2027-01-17 (90 days after the last review) |
| Rule ID | `php.runtime.eol-7.4` |

## Sources

- [PHP unsupported branches](https://www.php.net/eol.php)
- [PHP supported versions](https://www.php.net/supported-versions.php)

## Detected by

No built-in detector reads `php` declarations yet; the rule is data in the [lifecycle registry](https://github.com/arminazimi/evergreen/blob/main/registry/php.json).

## Data

This page is generated from [`registry/php.json`](https://github.com/arminazimi/evergreen/blob/main/registry/php.json), rule `php.runtime.eol-7.4`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "@id": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.4.html",
  "url": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.4.html",
  "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/php.runtime.eol-7.4.html",
  "headline": "PHP 7.4 is end-of-life — dates, impact, migration",
  "description": "The PHP unsupported branches page lists the PHP 7.4 branch as end of life on 2022-11-28; the branch no longer receives security or bug fixes from the PHP project.",
  "inLanguage": "en",
  "dateModified": "2026-10-19",
  "keywords": [
    "end-of-life",
    "php",
    "high"
  ],
  "about": {
    "@type": "Thing",
    "name": "PHP 7.4 is end-of-life",
    "identifier": "pkg:generic/php"
  },
  "citation": [
    {
      "@type": "CreativeWork",
      "name": "PHP unsupported branches",
      "url": "https://www.php.net/eol.php"
    },
    {
      "@type": "CreativeWork",
      "name": "PHP supported versions",
      "url": "https://www.php.net/supported-versions.php"
    }
  ],
  "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/php.json",
  "publisher": {
    "@type": "Organization",
    "name": "Evergreen",
    "url": "https://arminazimi.github.io/evergreen"
  }
}
</script>
