---
title: "Is PHP end of life? — versions, dates, sources"
description: "Some PHP releases are end of life. PHP 8.1 is end-of-life as of 2025-12-31. This page lists 7 reviewed lifecycle rules for pkg:generic/php, with the status, date, and source for each."
canonical_url: "https://arminazimi.github.io/evergreen/eol/php.html"
---

# Is PHP end of life?

**Some PHP releases are end of life.** PHP 8.1 is end-of-life as of 2025-12-31. This page lists 7 reviewed lifecycle rules for `pkg:generic/php`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/php
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [PHP 8.1 is end-of-life](../rules/php.runtime.eol-8.1.html) | End of life | 2025-12-31 | `vers:semver/>=8.1.0\|<8.2.0` | [PHP unsupported branches](https://www.php.net/eol.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 8.0 is end-of-life](../rules/php.runtime.eol-8.0.html) | End of life | 2023-11-26 | `vers:semver/>=8.0.0\|<8.1.0` | [PHP unsupported branches](https://www.php.net/eol.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 7.4 is end-of-life](../rules/php.runtime.eol-7.4.html) | End of life | 2022-11-28 | `vers:semver/>=7.4.0\|<8.0.0` | [PHP unsupported branches](https://www.php.net/eol.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 7.3 is end-of-life](../rules/php.runtime.eol-7.3.html) | End of life | 2021-12-06 | `vers:semver/>=7.3.0\|<7.4.0` | [PHP release branches](https://www.php.net/releases/branches.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 7.2 is end-of-life](../rules/php.runtime.eol-7.2.html) | End of life | 2020-11-30 | `vers:semver/>=7.2.0\|<7.3.0` | [PHP release branches](https://www.php.net/releases/branches.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 7.1 is end-of-life](../rules/php.runtime.eol-7.1.html) | End of life | 2019-12-01 | `vers:semver/>=7.1.0\|<7.2.0` | [PHP release branches](https://www.php.net/releases/branches.php), [PHP supported versions](https://www.php.net/supported-versions.php) |
| [PHP 7.0 is end-of-life](../rules/php.runtime.eol-7.0.html) | End of life | 2019-01-10 | `vers:semver/>=7.0.0\|<7.1.0` | [PHP release branches](https://www.php.net/releases/branches.php), [PHP supported versions](https://www.php.net/supported-versions.php) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/php.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/php.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is PHP end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some PHP releases are end of life. PHP 8.1 is end-of-life as of 2025-12-31. This page lists 7 reviewed lifecycle rules for pkg:generic/php, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check PHP?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/php."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the PHP dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
