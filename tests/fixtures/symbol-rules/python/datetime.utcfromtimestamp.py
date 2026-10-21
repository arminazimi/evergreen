import datetime

datetime.datetime.utcfromtimestamp(0)  # reported: call of utcfromtimestamp
datetime.datetime.fromtimestamp(0, datetime.UTC)  # not reported: the replacement
# datetime.datetime.utcfromtimestamp(1)  # not reported: a comment
