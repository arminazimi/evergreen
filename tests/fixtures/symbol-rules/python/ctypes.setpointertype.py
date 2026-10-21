import ctypes

ctypes.SetPointerType(arg)  # reported: call of ctypes.SetPointerType
# ctypes.SetPointerType(arg)  # not reported: a comment
note = "ctypes.SetPointerType"  # not reported: a string
ctypes.other(arg)  # not reported: another member
