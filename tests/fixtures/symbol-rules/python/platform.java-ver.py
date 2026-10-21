import platform

platform.java_ver(arg)  # reported: call of platform.java_ver
# platform.java_ver(arg)  # not reported: a comment
note = "platform.java_ver"  # not reported: a string
platform.other(arg)  # not reported: another member
