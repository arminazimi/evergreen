# 0021 — Ship adoption and visibility as one release, with one launch

Status: accepted

Supersedes the two-release split in [decision 0018](0018-adoption-before-v1.md).

## Problem

Decision 0018 put two releases before v1: v0.8.0 for adoption and v0.9.0 for visibility. The roadmap also planned three mini-launches and a separate outreach task. In practice the two milestones were worked on at the same time, so the split no longer described the order of the work. Four launch tasks for one project that has not launched yet also split a small audience and a single maintainer's attention.

## Decision

1. **One release comes before v1.** v0.8.0 holds the work of both former releases and is now titled _v0.8.0 — Adoption and visibility_, due 2027-01-26. There is no v0.9.0.
2. **There is one launch.** The issue _Launch Evergreen_ (#315) replaces the three mini-launches (#289, #295, #298) and keeps their audiences: agent builders, DevOps and platform teams, and supply-chain and security communities. Posts still go out one channel at a time, as the [launch kit](../launch/README.md) asks.
3. **The launch follows the release.** It depends on the v0.8.0 release and the demo video, so it points people at a version that includes this work.

## Consequences

- Phase 37 (v1 hardening) now follows v0.8.0 directly. Its window is unchanged.
- Usage still comes before attention: the pilot users and the v0.8.0 release come before the launch.
- The `V09` phase is removed from `planning/roadmap/`. Epic keys such as `E-v09-seo` stay, because they are stable identifiers recorded in `planning/roadmap/out/state.json`.
- Decision records written before this one, such as [0019](0019-privacy-first-adoption-metrics.md), may still say v0.9.0. Read that as the visibility work of v0.8.0.
