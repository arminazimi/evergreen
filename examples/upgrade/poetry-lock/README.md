# Poetry lockfile upgrade example

This lockfile has one main-group package that excludes Python 3.13:

```bash
node dist/tools/examples.js upgrade/poetry-lock upgrade-check --to python@3.13
```

```text
blocked
poetry.lock:5  numpy@1.24.0  numpy@1.24.0 declares python-versions ">=3.8,<3.12", which excludes Python 3.13.  [lockfile: python-versions: >=3.8,<3.12]
```

The command reads `poetry.lock` only. It installs nothing, runs no project command, and uses no network.
