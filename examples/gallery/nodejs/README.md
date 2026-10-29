# Node.js example

Node.js 20 pinned in .nvmrc. This directory holds the smallest files that make the nodejs detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/nodejs
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/nodejs --format json
```

The scan is offline and reads the files only.
