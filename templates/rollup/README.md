# Evergreen organization rollup report

This template deploys a static, single-page lifecycle risk dashboard for your organization to GitHub Pages with no server required.

## Overview

The workflow (`pages.yml`) runs via `workflow_run` after the "Evergreen organization scan" workflow completes successfully. It downloads the matrix report artifacts (`evergreen-report-<repository>`) from the triggering scan run using `run-id`, builds a self-contained HTML page using `evergreen rollup --html`, and publishes it to GitHub Pages.

Independent schedule and manual triggers are omitted because artifacts belong to the triggering scan run; running on an uncoupled schedule is redundant since the scan workflow itself is already scheduled.

## Setup

1. **Enable GitHub Pages:**
   - In your repository settings, go to **Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.

2. **Add the workflow:**
   - Copy `pages.yml` into `.github/workflows/evergreen-rollup.yml` in your dashboard repository.

3. **Configure ownership (optional):**
   - Copy `owners.json` into the root of your repository.
   - Map repository names to their owning teams (e.g. `{"api": "backend", "web": "frontend"}`).

## Features

- **Per-repository breakdown:** Finding counts by severity and nearest upcoming deadline.
- **Deadlines table:** Upcoming end-of-life and deprecation dates sorted chronologically with affected repositories.
- **Product & owner views:** Grouped views across all repositories in the organization.
- **Offline & deterministic:** The HTML report is self-contained with embedded JSON data, styled for light and dark modes, and protected with a strict Content Security Policy.
