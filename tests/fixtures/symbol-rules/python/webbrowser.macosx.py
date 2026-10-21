import webbrowser

use(webbrowser.MacOSX)  # reported: reference to webbrowser.MacOSX
# webbrowser.MacOSX(arg)  # not reported: a comment
note = "webbrowser.MacOSX"  # not reported: a string
webbrowser.other(arg)  # not reported: another member
