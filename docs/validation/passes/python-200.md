---
title: Python corpus at 200 repositories
---

# Python corpus at 200 repositories

Selection for the 93 repositories added on 2026-11-07 (`benchmarks/public-repositories/python/0701` to `0793`) was fixed before Evergreen ran on them, following [decision 0030](../../decisions/0030-corpus-selection-and-200-target.md).

- **Discovery:** `gh search code` on 2026-11-07 for the root files `pyproject.toml`, `requirements.txt`, `setup.cfg`, and `.python-version`, with version-neutral terms (`python`, `version`, `pytest`, `django`, `flask`, `numpy`, `pandas`, `torch`, `setuptools`, `click`), 100 results per query. 992 distinct non-fork repositories had the file at the root.
- **Eligibility:** public, not archived or a mirror, GitHub size at most 50,000 KB, a default-branch commit on or after 2024-11-07, a complete tree, an OSI-approved SPDX license with a license file in the tree, and the input file at the root. 420 passed. The rest failed on activity (341), size (136), missing or non-OSI license (92), or were already in the corpus (2).
- **Order:** strata are the first matching input form in profile order (`pyproject.toml`, `requirements.txt`, `setup.cfg`, `.python-version`) by size band (at most 5,000 KB, then larger), sorted by lowercase `owner/name`, walked round-robin; the first 93 were kept. Each is pinned to its default-branch commit on that date, and none was chosen or dropped because of its score.
- **Provenance limits:** license files were identified by name and GitHub's SPDX guess, not read for coverage of the input files. The search returns at most 100 hits per query, so the pool is limited by the queries, not by what exists.
- **Ground truth:** every one of the 494 findings Evergreen reported on the 93 repositories had its cited line read in the pinned checkout and checked against the registry rule it was filed under. An independent `grep` for old GitHub Action majors, `python_requires` / `requires-python` floors, `FROM python:` tags, and `.python-version` files found the false negative below.
- **Result on the 93 additions:** 494 findings reviewed. The review found three detector bugs (each its own issue: #2539, #2540, #2541); they were fixed in the same pull request, so the 93 additions end with 495 confirmed findings (the Poetry `python` floor is now at its real line 54, and the Django finding at line 57), precision 1.0 and recall 1.0 on this sample. The harness reports no false positives or negatives for the Python corpus.
- **Problems found and fixed, repositories kept:** a Poetry `python = "^3.8"` floor was reported at the first line mentioning "python" (a classifier) instead of its own line (`2ik/django-editorjs-fields`); the Django package finding was anchored to `name = "django-editorjs-fields"` instead of `Django = "^4.2"`; and `uses: actions/checkout@v3 ` with a trailing space was not detected (`boxed/django-fastdev`, `.github/workflows/check_tests.yml:14`).
