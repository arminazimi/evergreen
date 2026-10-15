# Evergreen Codex plugin submission

Evergreen is prepared as a desktop-only Codex plugin because its MCP server runs locally over stdio. Repository data remains on the user's computer, the tools are read-only, and no Evergreen account is required.

## Release package

Build the review ZIP from canonical sources:

```sh
npm run package:codex-plugin
```

The command regenerates the package and writes `artifacts/evergreen-codex-plugin-<version>.zip`. The manifest, Skill, MCP configuration, approved icons, walkthrough image, license, README, and review fixture are all at the archive root.

## Reviewer walkthrough

1. Install Node.js 22 or newer and extract the ZIP.
2. Confirm the plugin shows the Evergreen name, approved Version Notches mark, and Developer Tools category.
3. Run: `Scan review-fixtures/demo for end-of-life runtimes, packages, and GitHub Actions.`
4. Confirm the result reports the fixture's evidence-backed Node.js, `request`, and `actions/checkout` findings with exact file locations.
5. Ask for an explanation and migration context for the `request` finding. Confirm that source usages and evidence links appear and no files change.
6. Update the fixture workflow to `actions/checkout@v5`, ask Evergreen to verify the original finding, and confirm it is absent without executing suggested commands.
7. Run the three negative cases in `review/submission.json` and confirm Evergreen declines unrelated security auditing, states that Java lifecycle coverage is unsupported, and does not execute migration commands automatically.

## Privacy and permissions

- The local MCP server reads repository files under the path authorized by the user.
- Results can include paths and short source excerpts and are returned to the host.
- Tools are read-only and do not edit files, run suggested commands, request credentials, or listen on a network port.
- The pinned npm package may be downloaded from the user's configured registry when first launched.
- See [Privacy](PRIVACY.md), [Support](SUPPORT.md), and [Terms](TERMS.md).

## Submission status

OpenAI currently limits public submissions containing local MCP servers to approved partners. The submitting Platform organization must be identity-verified and allowlisted by an OpenAI representative before the ZIP can be uploaded through the plugin portal. Track allowlist confirmation, automated findings, reviewer feedback, approval, and publication in [Issue #31](https://github.com/arminazimi/evergreen/issues/31).
