import imp

imp.get_magic(arg)  # reported: call of imp.get_magic
# imp.get_magic(arg)  # not reported: a comment
note = "imp.get_magic"  # not reported: a string
imp.other(arg)  # not reported: another member
