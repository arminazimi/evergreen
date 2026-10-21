import sys

sys._enablelegacywindowsfsencoding(arg)  # reported: call of sys._enablelegacywindowsfsencoding
# sys._enablelegacywindowsfsencoding(arg)  # not reported: a comment
note = "sys._enablelegacywindowsfsencoding"  # not reported: a string
sys.other(arg)  # not reported: another member
