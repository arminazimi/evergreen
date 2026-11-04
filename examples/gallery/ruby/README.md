# Ruby example

Ruby 3.2 pinned in version files, the Gemfile, and the lockfile. This directory holds the smallest files that make the ruby detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/ruby scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/ruby scan --format json
```

The scan is offline and reads the files only.
