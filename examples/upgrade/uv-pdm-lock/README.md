# uv and PDM lockfile upgrade example

This repository's `uv.lock` has a `twisted` fork that resolves only below Python 3.13, and its `pdm.lock` has a dev-group `black` that excludes it:

```bash
node dist/tools/examples.js upgrade/uv-pdm-lock upgrade-check --to python@3.13
```

```text
python@3.13: blocked (1 blockers, 1 warnings, 0 unknown)
uv.lock:7  twisted@24.3.0  twisted@24.3.0 resolves only for Python versions matching "python_full_version < '3.13'", which excludes Python 3.13.  [lockfile: resolution-markers: python_full_version < '3.13']
pdm.lock:4  black@24.3.0  black@24.3.0 is in the dev group and its requires_python ">=3.9,<3.13" excludes Python 3.13.  [lockfile: requires_python: >=3.9,<3.13]
```

The command reads `uv.lock` and `pdm.lock` only. It installs nothing, runs no project command, and uses no network.
