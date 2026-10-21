import importlib.util

importlib.util.set_package(arg)  # reported: call of importlib.util.set_package
# importlib.util.set_package(arg)  # not reported: a comment
note = "importlib.util.set_package"  # not reported: a string
importlib.util.other(arg)  # not reported: another member
