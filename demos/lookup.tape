# Evergreen demo tape: look up one product's lifecycle status offline.
#
# The `lookup` output is registry data only — no clock, no paths, no network —
# so re-renders change only when the bundled lifecycle data for the product
# changes. `Output` paths resolve against the current directory, so always
# render from the repository root; see demos/scan.tape for the one-command
# regeneration loop and the CI drift gate in .github/workflows/demos.yml.

Output docs/assets/demos/lookup.gif

Require node
Require bash

Set Shell "bash"
Set Width 1280
Set Height 380
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

Type "node dist/src/cli.js lookup node 18" Enter
Wait@30s /evergreen .*$/
Sleep 3
