import ssl

ssl.RAND_pseudo_bytes(arg)  # reported: call of ssl.RAND_pseudo_bytes
# ssl.RAND_pseudo_bytes(arg)  # not reported: a comment
note = "ssl.RAND_pseudo_bytes"  # not reported: a string
ssl.other(arg)  # not reported: another member
