import imp

imp.reload(arg)  # reported: call of imp.reload
# imp.reload(arg)  # not reported: a comment
note = "imp.reload"  # not reported: a string
imp.other(arg)  # not reported: another member
