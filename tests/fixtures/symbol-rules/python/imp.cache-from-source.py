import imp

imp.cache_from_source(arg)  # reported: call of imp.cache_from_source
# imp.cache_from_source(arg)  # not reported: a comment
note = "imp.cache_from_source"  # not reported: a string
imp.other(arg)  # not reported: another member
