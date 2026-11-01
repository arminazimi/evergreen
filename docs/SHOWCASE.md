---
title: Showcase
---

# Showcase

Short, copy-pasteable ways to show what Evergreen found. Every command runs locally against files on disk; nothing is uploaded and no scan uses the network. Unless a section names another project, the examples use the deliberately outdated project at `examples/demo` in this repository.

## Live countdown

```bash
npx evergreen-deprecation countdown examples/gallery --as-of 2026-10-25
```

Prints one row per dated deadline that affects the project: the subject, a bar scaled to the remaining time in a two-year window, and the time left until 00:00 UTC on the deadline. Bars are green over 180 days, yellow from 30 to 180, red under 30, and dim once the date has passed. Rows are sorted by deadline, and `--limit` keeps the soonest ten by default.

On a terminal the frame redraws once per second for six seconds and stops on the final frame. `--once` prints one frame, `--no-animation` keeps one static frame, and piping the output prints one plain frame. `--json` prints the same rows with `subject`, `deadline`, `remainingSeconds`, `ruleId`, and `location`, so a script can chart or gate on them.

The example uses `examples/gallery`, which has upcoming deadlines across container, runtime, and package rules. `docs/demos/countdown.tape` records the animation with [VHS](https://github.com/charmbracelet/vhs); regenerate the GIF with `vhs docs/demos/countdown.tape`.

## Glance card

```bash
npx evergreen-deprecation glance examples/gallery --as-of 2026-10-25
```

Prints a one-screen summary of the repository's lifecycle state, laid out like `neofetch`: the Evergreen mark on the left in the brand green, the facts on the right. The facts are the repository name, every detected ecosystem with its maturity level, findings by severity as colored blocks, the next deadline, the oldest ended item, and the lifecycle data version and age. The counts are the ones `scan --json` reports for the same path.

Under 80 terminal columns the mark is dropped and the facts keep the full width. `--json` prints the facts alone as an `evergreen.glance.v1` document, so a script or a dashboard can reuse them. `docs/demos/glance.tape` records the card with [VHS](https://github.com/charmbracelet/vhs); regenerate the GIF with `vhs docs/demos/glance.tape`.

## Mermaid support windows

```bash
npx evergreen-deprecation scan --format mermaid --as-of 2026-10-30 examples/demo
```

Prints a fenced `mermaid` block containing a Gantt chart: one section per ecosystem and one bar per subject from the day the scan observed it to its deadline. A subject that has already ended is a `crit` milestone at its deadline; one that ends within 30 days is a `crit` bar. A `today` milestone follows `--as-of`. Paste the whole block into a README, an issue, or a pull request comment and GitHub renders the chart without an image file.

```mermaid
gantt
    title Evergreen support windows
    dateFormat YYYY-MM-DD
    axisFormat %Y-%m
    todayMarker off

    section github-actions
    Unsupported actions/checkout runtime :crit, milestone, bar0, 2026-09-23, 0d

    section nodejs
    Node.js 19 is end-of-life :crit, milestone, bar1, 2023-06-01, 0d
    Node.js 18 is end-of-life :crit, milestone, bar2, 2025-04-30, 0d
    Node.js 20 is end-of-life :crit, milestone, bar3, 2026-04-30, 0d

    section npm
    request is deprecated :crit, milestone, bar4, 2020-02-11, 0d

    section today
    today 2026-10-30 : milestone, marker, 2026-10-30, 0d
```

`--as-of <YYYY-MM-DD>` moves the bars and the `today` milestone together, so the same date always prints the same chart. The chart draws at most 40 bars and ends with a line such as `and 3 more`; `--format json` still lists every finding. Use it when a pull request or a README should show when support for what the repository uses runs out.

The same chart is available for the look-ahead window:

```bash
npx evergreen-deprecation forecast --format mermaid --as-of 2026-10-30 examples/demo
```

`forecast --format mermaid` draws one bar per dated event in the forecast window, grouped by ecosystem, instead of only the findings in this repository.

The GitHub Action's pull request comment is raw Markdown, so a Mermaid block renders there too. The built-in comment does not include the chart or accept a comment template yet, so paste the command's output into a comment, or add a workflow step that writes it.

## Animated forecast for a README

`evergreen forecast --svg --animate` draws the coming months as a self-contained SVG: one bar from today to each dated lifecycle event, in date order, and a today marker that pulses twice. Bars follow the severity lanes, the file reads in light and dark through `prefers-color-scheme`, and `prefers-reduced-motion: reduce` shows the final frame immediately. The SVG contains no script, no `<foreignObject>`, and no external references.

```bash
npx evergreen-deprecation forecast . --months 12 --svg --animate > docs/forecast.svg
```

Commit `docs/forecast.svg`, then embed it in the README:

```markdown
![Lifecycle forecast](docs/forecast.svg)
```

Use HTML when the image needs a width or a longer description:

```html
<img src="docs/forecast.svg" width="720" alt="Lifecycle forecast: dated end-of-life events in the next twelve months">
```

Without `--animate`, the command prints the marker-only timeline that the HTML report embeds, with no animation block. `--as-of <YYYY-MM-DD>` fixes the window when you need the file to stay byte-identical, for example in a test or a release note.

### Refresh it on a schedule

A scheduled GitHub Actions workflow can regenerate the file and commit it when the forecast changes. The scan is local, so the job only needs a checkout, Node.js 22, and `contents: write` to push the refreshed file.

```yaml
name: Refresh lifecycle forecast

on:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  forecast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes evergreen-deprecation@0.8.0 forecast . --svg --animate > docs/forecast.svg
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add docs/forecast.svg
          git diff --cached --quiet || git commit -m "docs: refresh the lifecycle forecast"
          git push
```

Pin the Evergreen release you use instead of always taking the latest. If the default branch is protected, open a pull request from the workflow instead of pushing to it. GitHub caches README images, so a refreshed file can take a few minutes to appear; the commit is the refresh.
