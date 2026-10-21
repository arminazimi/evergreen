import imp

imp.new_module(arg)  # reported: call of imp.new_module
# imp.new_module(arg)  # not reported: a comment
note = "imp.new_module"  # not reported: a string
imp.other(arg)  # not reported: another member
