/**
 * PyPI projects the `pypi-status` importer checks. PyPI reports a status (active, archived, deprecated,
 * or quarantined) for each project but has no list of projects that are not active, so a maintainer or
 * contributor adds the projects worth watching here.
 *
 * Add the project name as published. Projects that are still active produce no rule, so the importer
 * lists them in its notes and they can be removed. Keep the list sorted, and prefer projects whose
 * simple-API page is small: each run downloads every listed project's file list.
 */
export const PYPI_CANDIDATES: readonly string[] = [
  "PIL",
  "argparse",
  "enum",
  "google-cloud",
  "pathlib",
  "typing",
];
