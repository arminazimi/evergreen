# Shell example

PowerShell 7.0 in a module manifest and script. This directory holds the smallest files that make the shell detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/shell
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/shell --format json
```

The scan is offline and reads the files only.
