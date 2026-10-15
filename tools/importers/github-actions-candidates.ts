/**
 * JavaScript actions the `github-actions-runtime` importer checks, as `owner/repo`. Actions that live in
 * a subdirectory of a repository (`github/codeql-action/init`) are not supported.
 *
 * Add an action when workflows commonly pin old majors of it. Actions that already run on a supported
 * runtime at every major produce no rule, so the importer lists them in its notes. Keep the list sorted.
 */
export const ACTION_CANDIDATES: readonly string[] = [
  "actions/cache",
  "actions/checkout",
  "actions/download-artifact",
  "actions/github-script",
  "actions/labeler",
  "actions/setup-go",
  "actions/setup-java",
  "actions/setup-node",
  "actions/setup-python",
  "actions/stale",
  "actions/upload-artifact",
];
