# PHP example

PHP 7.4 pinned in version files, composer.json, and the lockfile. This directory holds the smallest files that make the php detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/php scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/php scan --format json
```

The scan is offline and reads the files only.
