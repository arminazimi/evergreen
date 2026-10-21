import imp

imp.get_suffixes(arg)  # reported: call of imp.get_suffixes
# imp.get_suffixes(arg)  # not reported: a comment
note = "imp.get_suffixes"  # not reported: a string
imp.other(arg)  # not reported: another member
