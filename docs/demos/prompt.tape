# Records the shell prompt section of docs/SHOWCASE.md.
# Generate with: vhs docs/demos/prompt.tape
Output docs/demos/prompt.gif

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 360
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Prompt "❯ "

Type "evergreen scan examples/ --fail-on none > /dev/null; evergreen prompt examples/"
Enter
Sleep 3s
Type "evergreen prompt examples/ --symbol EOL:"
Enter
Sleep 3s
