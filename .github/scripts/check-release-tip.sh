#!/usr/bin/env bash
# Release tags point at the tip of release/<tag>: the release commit on main plus the one
# commit that adds the compiled Action bundle. Accepting anything else would publish a tag
# whose Action cannot run, and anything but dist/action would ship code that never passed
# review on main. Run from a full checkout with GITHUB_SHA and GITHUB_REF_NAME set.
set -euo pipefail
expected="v$(node -p "require('./package.json').version")"
if [ "$GITHUB_REF_NAME" != "$expected" ]; then
  echo "Tag $GITHUB_REF_NAME does not match package.json version $expected." >&2
  exit 1
fi
git fetch --no-tags origin main
branch="release/$GITHUB_REF_NAME"
tip="$(git ls-remote --heads origin "refs/heads/$branch" | cut -f1)"
if [ "$tip" != "$GITHUB_SHA" ]; then
  echo "$GITHUB_SHA is not the tip of $branch." >&2
  echo "Tag the release branch tip: wait for the Release workflow, then tag $branch." >&2
  exit 1
fi
parent="$(git rev-parse "$GITHUB_SHA^")"
if ! git merge-base --is-ancestor "$parent" origin/main; then
  echo "$parent, the parent of $GITHUB_SHA, is not on main; tag the release commit's branch." >&2
  exit 1
fi
changed="$(git diff --name-only "$parent" "$GITHUB_SHA")"
unexpected="$(printf '%s\n' "$changed" | grep -v -E '^dist/action/' || true)"
if [ -n "$unexpected" ]; then
  echo "The commit $GITHUB_SHA changes more than the Action bundle:" >&2
  echo "$unexpected" >&2
  exit 1
fi
if [ ! -f dist/action/index.js ]; then
  echo "The tag does not contain dist/action/index.js, so the Action would fail." >&2
  exit 1
fi
