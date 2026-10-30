---
title: Blog
---

# Evergreen blog

Short notes on lifecycle dates that just passed, and forward-looking "Is your repo affected?" posts for upcoming deadlines. Both are generated or drafted from the registry and reviewed before publishing.

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
4. Add front matter with a title, and move the file to `docs/blog/<YYYY-MM-DD>-what-went-end-of-life.md` (weekly recap) or `docs/blog/<YYYY-MM-DD>-…-is-your-repo-affected.md` (upcoming deadline).
5. Open a pull request. Merging publishes the page on the documentation site; there is no separate posting step.

Delete the draft when the window has no entries worth a post; do not publish an empty one.

## Posts

- [Is your repo affected? Alpine Linux 3.21 ends 2026-11-01](2026-10-30-alpine-3-21-is-your-repo-affected.md)
- [Is your repo affected? Azure Pipelines macOS 14 removal on 2026-11-02](2026-10-30-azure-pipelines-macos-14-is-your-repo-affected.md)
- [Is your repo affected? Rails 8.0 security support ends 2026-11-07](2026-10-30-rails-8-0-is-your-repo-affected.md)
- [What went end of life this week (2026-10-22 to 2026-10-28)](2026-10-29-what-went-end-of-life.md)
