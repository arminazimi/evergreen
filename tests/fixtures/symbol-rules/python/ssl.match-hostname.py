import ssl

ssl.match_hostname(arg)  # reported: call of ssl.match_hostname
# ssl.match_hostname(arg)  # not reported: a comment
note = "ssl.match_hostname"  # not reported: a string
ssl.other(arg)  # not reported: another member
