# Python example

Python 3.9 pinned in .python-version. This directory holds the smallest files that make the python detector report; nothing here is installed or executed.

```bash
node dist/tools/examples.js gallery/python scan
```

`expected.json` lists the findings the scan must return. Compare the two:

```bash
node dist/tools/examples.js gallery/python scan --format json
```

The scan is offline and reads the files only.
