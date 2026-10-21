import ssl

ssl.wrap_socket(arg)  # reported: call of ssl.wrap_socket
# ssl.wrap_socket(arg)  # not reported: a comment
note = "ssl.wrap_socket"  # not reported: a string
ssl.other(arg)  # not reported: another member
