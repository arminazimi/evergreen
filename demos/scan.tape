# Evergreen demo tape: scan the offline demo project (`scan --demo`) in the
# compact format.
#
# Determinism: `--format compact` carries no clock, no data-age line, and no
# absolute paths, and the prompt is pinned below, so re-renders only change
# when the CLI output changes. `Output` paths resolve against the current
# directory, so always render from the repository root.
#
# Regenerate every recording with one command (needs `npm ci && npm run build`
# plus VHS, ttyd, ffmpeg, and a Chromium-based browser on PATH or downloaded
# by VHS):
#
#   for tape in demos/*.tape; do vhs "$tape" || exit 1; done
#
# .github/workflows/demos.yml runs exactly that in CI and fails when the
# committed recordings under docs/assets/demos/ drift from a fresh render.

Output docs/assets/demos/scan.gif

Require node
Require bash

Set Shell "bash"
Set Width 1280
Set Height 420
Set FontSize 16
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 25ms
Set CursorBlink false

# Pin the prompt so the recording never shows the build machine's PS1.
Hide
Type "export PS1='evergreen $ '" Enter
Type "clear" Enter
Show

Type "node dist/src/cli.js scan --demo --format compact" Enter
Wait@30s /evergreen .*$/
Sleep 3
