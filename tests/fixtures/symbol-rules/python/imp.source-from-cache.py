import imp

imp.source_from_cache(arg)  # reported: call of imp.source_from_cache
# imp.source_from_cache(arg)  # not reported: a comment
note = "imp.source_from_cache"  # not reported: a string
imp.other(arg)  # not reported: another member
