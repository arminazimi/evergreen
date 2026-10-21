import importlib.util

importlib.util.module_for_loader(arg)  # reported: call of importlib.util.module_for_loader
# importlib.util.module_for_loader(arg)  # not reported: a comment
note = "importlib.util.module_for_loader"  # not reported: a string
importlib.util.other(arg)  # not reported: another member
