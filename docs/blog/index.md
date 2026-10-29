---
title: Blog
---

# Evergreen blog

Short notes on lifecycle dates that just passed, generated from the registry and reviewed before publishing.

Nothing here is posted automatically. Every post starts as a local draft, a maintainer checks each claim against its source, and only a merged pull request publishes it.

## Generate this week's draft

```bash
npm ci
npm run build
node dist/tools/eol-calendar.js --post-days 7 --out-dir drafts
```

This writes `drafts/weekly-post.md` for the seven days before today, plus the usual calendar files. `--today YYYY-MM-DD` makes the output reproducible, and `--bundle FILE` reads a signed data release instead of `registry/`. The generator reads repository files only: no network, no credentials, and no publishing step.

## Review before publishing

1. Open every source in the draft and confirm it still says what the rule says.
2. Check the date and the affected versions against that source.
3. Edit the prose for readers without changing the claim.
4. Add front matter with a title, and move the file to `docs/blog/<YYYY-MM-DD>-what-went-end-of-life.md`.
5. Open a pull request. Merging publishes the page on the documentation site; there is no separate posting step.

Delete the draft when the window has no entries worth a post; do not publish an empty one.

## Posts

- [What went end of life this week (2026-10-22 to 2026-10-28)](2026-10-29-what-went-end-of-life.md)
