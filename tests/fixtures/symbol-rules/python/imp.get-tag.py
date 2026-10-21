import imp

imp.get_tag(arg)  # reported: call of imp.get_tag
# imp.get_tag(arg)  # not reported: a comment
note = "imp.get_tag"  # not reported: a string
imp.other(arg)  # not reported: another member
