#!/usr/bin/env bash
# The workflow supplies TAG, DRY_RUN, FORCE and GH_TOKEN. Never executes tagged code.
set -euo pipefail
notes_dir="$(mktemp -d)"
trap 'rm -rf "$notes_dir"' EXIT
# Read the file at the immutable tag, not the default branch's newer changelog.
git show "refs/tags/$TAG:CHANGELOG.md" > "$notes_dir/CHANGELOG.md"
node .github/scripts/release-notes.mjs "$TAG" "$notes_dir/CHANGELOG.md" --body > "$notes_dir/notes.md"
if [ "${DRY_RUN:-false}" = "true" ]; then
  cat "$notes_dir/notes.md"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$notes_dir/notes.md" >> "$GITHUB_STEP_SUMMARY"; fi
  exit 0
fi
body="$(gh release view "$TAG" --json body --jq .body)"
if [ "${FORCE:-false}" != "true" ] && [ "$body" != "Standalone binaries for $TAG. Release notes follow." ]; then
  echo "Preserving the existing release body for $TAG; use force to replace it."
  exit 0
fi
gh release edit "$TAG" --notes-file "$notes_dir/notes.md"
