---
title: Distribution brand checklist
---

# Distribution brand checklist

Use this checklist whenever Evergreen is added to or updated on a public surface.
The approved source of truth is the
[brand guide](https://github.com/arminazimi/evergreen/blob/main/brand/BRAND_GUIDE.md);
do not redesign the identity for an individual channel.

## Universal checks

- [ ] Use `Evergreen` as the display name and `evergreen-deprecation` only where a
      package or machine identifier is required.
- [ ] Use the tagline exactly as `Know what breaks next.`
- [ ] Use the descriptor exactly as `Local-first deprecation intelligence for
      software repositories.` when category clarity is required.
- [ ] Use `Evidence-backed migration context for humans and coding agents.` only
      as the approved supporting message.
- [ ] Select an approved dark, light, or monochrome asset; never redraw the mark.
- [ ] Preserve clear space, minimum size, and accessible color pairs.
- [ ] Keep official brand content in English and omit personal attribution.
- [ ] Link to the official repository, documentation, and package.
- [ ] Confirm the surface does not imply hosted analysis, automatic code changes,
      complete ecosystem coverage, or guaranteed migration safety.
- [ ] Re-check the platform's current image and metadata specifications before
      upload.

## Repository and GitHub

- [x] README uses the adaptive dark/light banner and approved descriptor.
- [x] Repository description uses the approved descriptor.
- [x] Homepage points to the public Evergreen documentation.
- [x] Repository topics describe the product rather than inventing brand variants.
- [ ] Upload `brand/exports/social-preview-dark.png` as the repository social
      preview and inspect a shared link on both light and dark clients.
- [x] Issue templates use `Evergreen` and evidence-backed language consistently.

## Documentation

- [x] Site title and description match approved naming.
- [x] Header uses the adaptive `Version Notches` mark.
- [x] Home page uses the approved tagline, descriptor, and supporting language.
- [x] Light and dark palettes use approved accessible pairs.
- [x] Brand guidance and asset terms are discoverable from public documentation.
- [x] The site remains static, dependency-light, and free of decorative raster
      downloads on documentation pages.

## npm

- [x] Package ID remains `evergreen-deprecation`.
- [x] Description matches the approved product descriptor.
- [x] Homepage, repository, bugs, license, and relevant discovery keywords exist.
- [ ] Reconfirm packed contents and rendered npm README before each publish.

## GitHub Action and Marketplace

- [x] Action name contains `Evergreen` and identifies lifecycle intelligence.
- [x] Action description is local-first, evidence-backed, and function-specific.
- [x] Marketplace icon/color use the closest supported neutral treatment.
- [x] Marketplace logo and feature-card sources exist in `brand/`.
- [ ] Preview marketplace metadata and images before creating or updating a
      listing.

## Agent Skill and future plugins

- [x] Agent Skill metadata names Evergreen and preserves trigger clarity.
- [x] Skill content states the local execution and evidence boundaries.
- [x] Reuse the approved name, descriptor, mark, and asset terms in every future
      plugin manifest and directory listing.
- [ ] Run host-specific discovery and context-cost evaluations before submission.

### Listing versions (reviewed 2026-10-29 against release `0.7.1`)

Record the version each public Skill or plugin surface shows after a release. The
current npm package, Action tag, and generated plugin pins are `0.7.1`.

- [x] [skills.sh](https://skills.sh/arminazimi/evergreen/evergreen-deprecation)
      lists `arminazimi/evergreen@evergreen-deprecation`. The page has no package
      version field; install resolves from the repository Skill on `main`, which
      matches the Skill shipped in `0.7.1`.
- [x] Claude repository marketplace
      (`.claude-plugin/marketplace.json` and `plugins/claude/`) publishes plugin
      version `0.7.1` and pins `evergreen-deprecation@0.7.1`.
- [x] Codex repository marketplace (`plugins/codex/`) publishes plugin version
      `0.7.1` and pins `evergreen-deprecation@0.7.1`. OpenAI's public plugin
      directory still has no Evergreen entry (submission tracked separately).

## Releases

- [ ] Use the approved banner or social-preview template for launch posts.
- [ ] Keep release notes factual; lead with lifecycle coverage and evidence.
- [ ] Confirm changelog, package metadata, Action metadata, and documentation agree.
- [ ] Verify every referenced asset exists in the tagged commit.
- [ ] Check all external links and render the README and documentation in light and
      dark modes.

## Asset audit

The canonical editable assets live in `brand/assets/` and `brand/templates/`.
Canonical raster exports live in `brand/exports/`. The documentation copy at
`docs/assets/brand/evergreen-mark-adaptive.svg` is the only intentional duplicate;
it exists because the GitHub Pages source is scoped to `docs/`. No legacy logo or
pre-brand social asset remains in the repository.

