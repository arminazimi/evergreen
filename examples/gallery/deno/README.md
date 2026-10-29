# Deno example

Deno 1.x and Bun 0.x/1.0 pins. This directory holds the smallest files that make the deno detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/deno
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/deno --format json
```

The scan is offline and reads the files only.
