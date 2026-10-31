---
title: Social drafts
---

# Social posts

Short posts for X, Bluesky, Mastodon, and LinkedIn, plus a four-post thread.
Attach the image named in each section and use the alt text from
[screenshots.md](screenshots.md). Character counts below include the text as
written; check them again if you edit before posting.

## X and Bluesky

X allows 280 characters and Bluesky allows 300. This post fits both.

**Image:** `../assets/screenshots/html-report.webp`

```text
Your update bot says a newer version exists. Evergreen tells you what is end-of-life, where this repo uses it, and which source backs the claim. Local-first, offline scans, no account.

npx evergreen-deprecation scan .

https://github.com/arminazimi/evergreen
```

**Character count:** 259.

**Alt text:** Evergreen HTML report from the demo project, showing three
findings with a high-severity deprecated package, its file location,
replacement, and source.

## Mastodon

Mastodon's default limit is 500 characters, though some instances raise or
lower it. This post fits the default.

**Image:** `../assets/screenshots/treemap.webp`

```text
Evergreen is a local-first CLI that finds end-of-life runtimes, deprecated packages, and retired GitHub Actions at the exact file and line. Every finding has severity, a replacement, and an authoritative source. Scans are offline, need no account, and never execute repository code. It also runs as a local MCP server, a GitHub Action, and an Agent Skill, with a baseline so CI gates new findings, not accepted ones.

npx evergreen-deprecation scan .

https://github.com/arminazimi/evergreen
```

**Character count:** 491.

**Alt text:** Treemap of Evergreen findings by file, sized by severity-weighted
finding count and colored by the highest severity in each file.

## LinkedIn

**Image:** `../assets/screenshots/job-summary.webp`

```text
Most dependency tools answer one question: is there a newer version? Evergreen answers another: what in this repository is about to stop working, where is it used, and what evidence says so?

Evergreen is a local-first CLI that finds end-of-life runtimes, deprecated packages, and retired GitHub Actions at the exact file and line. Each finding carries severity, a replacement, an authoritative source, and migration context for a human or coding agent. Scans make no network requests, need no account, and never execute repository code.

It runs as a CLI, a local MCP server, a GitHub Action, and an Agent Skill. A baseline accepts known findings with an owner, reason, and expiry, so CI gates new findings, not accepted ones.

npx evergreen-deprecation scan .

https://github.com/arminazimi/evergreen
```

**Alt text:** GitHub Actions job summary from Evergreen showing two high and one
medium finding, with file locations and evidence labels.

## Thread

Use the thread when one post is not enough. Each post fits X and Bluesky limits.

**Post 1**

```text
Dependency bots tell you a newer version exists. They rarely tell you which removal will break your repo, where it is used, or what evidence backs the claim. I maintain Evergreen, a local-first CLI for that question. 1/4
```

**Post 2**

```text
Scan a checkout and get every end-of-life runtime, deprecated package, and retired GitHub Action at the exact file and line, with severity, replacement, source, and migration context. 2/4
```

**Image for post 2:** `../assets/screenshots/html-report.webp` with the same alt
text as the X post.

**Post 3**

```text
Scans are offline, need no account, and never execute repository code. Baseline known findings; gate CI only on new ones. GitHub Action, GitLab component, local MCP server, and Agent Skill. 3/4
```

**Post 4**

```text
Try: npx evergreen-deprecation scan . Then tell me which lifecycle risks your current tooling misses. https://github.com/arminazimi/evergreen 4/4
```

## Where to post

- **X and Bluesky:** use the single post first. Quote-post or reply with the
  thread only if there is interest.
- **Mastodon:** use the Mastodon post on a technology or open-source instance.
  Add the image's alt text; do not rely on the platform to generate it.
- **LinkedIn:** use the LinkedIn post and one image. Keep the first two lines
  readable before the "see more" fold; they already carry the hook.
- **Dev communities:** if a community reposts the thread, link to the original
  instead of reposting the same text.

## Notes

- Disclose that you maintain the project where the platform or community
  requires it, and do not ask for upvotes, boosts, or likes.
- Do not add engagement bait, emojis, or hashtag blocks. One or two relevant
  hashtags on LinkedIn are enough if you want them.
- Keep the `no-data` and scope language out of the short posts only because there
  is no room; the linked documentation carries the limits.
