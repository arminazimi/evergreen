# Ruby example

Ruby 3.2 pinned in version files, the Gemfile, and the lockfile. This directory holds the smallest files that make the ruby detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/ruby
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/ruby --format json
```

The scan is offline and reads the files only.
