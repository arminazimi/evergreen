import imp

imp.find_module(arg)  # reported: call of imp.find_module
# imp.find_module(arg)  # not reported: a comment
note = "imp.find_module"  # not reported: a string
imp.other(arg)  # not reported: another member
