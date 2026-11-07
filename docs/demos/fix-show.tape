# Records the fix before-and-after section of docs/SHOWCASE.md.
# Generate with: vhs docs/demos/fix-show.tape
Output docs/demos/fix-show.gif

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 520
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Prompt "❯ "

Type "npm run --silent example -- codemods/dockerfile-legacy fix --show"
Enter
Sleep 8s
