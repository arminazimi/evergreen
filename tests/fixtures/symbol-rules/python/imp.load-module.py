import imp

imp.load_module(arg)  # reported: call of imp.load_module
# imp.load_module(arg)  # not reported: a comment
note = "imp.load_module"  # not reported: a string
imp.other(arg)  # not reported: another member
