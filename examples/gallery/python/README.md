# Python example

Python 3.9 pinned in .python-version. This directory holds the smallest files that make the python detector report; nothing here is installed or executed.

```bash
node dist/src/cli.js scan examples/gallery/python
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/src/cli.js scan examples/gallery/python --format json
```

The scan is offline and reads the files only.
