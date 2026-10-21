import glob

glob.glob0(arg)  # reported: call of glob.glob0
glob.glob1(arg)  # reported: call of glob.glob1
# glob.glob0(arg)  # not reported: a comment
note = "glob.glob0"  # not reported: a string
glob.other(arg)  # not reported: another member
