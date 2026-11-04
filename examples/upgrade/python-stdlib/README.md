# Python standard library example

This project can move to Python 3.12 but not to Python 3.13: `app.py` imports two modules that PEP 594 removed in 3.13.

```bash
node dist/tools/examples.js upgrade/python-stdlib upgrade-check --to python@3.13
```

The report lists `cgi` and `telnetlib` as blockers at their exact import lines, each with the rule id and the PEP and What's New sources behind it. Switching the target to `python@3.12` reports no issue for either module.

Nothing here is executed: `upgrade-check` reads the files and the bundled lifecycle rules only.
