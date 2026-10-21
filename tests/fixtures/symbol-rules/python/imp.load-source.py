import imp

imp.load_source(arg)  # reported: call of imp.load_source
# imp.load_source(arg)  # not reported: a comment
note = "imp.load_source"  # not reported: a string
imp.other(arg)  # not reported: another member
