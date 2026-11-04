# Records the live countdown section of docs/SHOWCASE.md.
# Generate with: vhs docs/demos/countdown.tape
Output docs/demos/countdown.gif

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 520
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Prompt "❯ "

Type "npm run --silent example -- gallery countdown --as-of 2026-10-25"
Enter
Sleep 8s
