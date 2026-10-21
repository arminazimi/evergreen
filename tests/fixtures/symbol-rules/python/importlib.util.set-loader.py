import importlib.util

importlib.util.set_loader(arg)  # reported: call of importlib.util.set_loader
# importlib.util.set_loader(arg)  # not reported: a comment
note = "importlib.util.set_loader"  # not reported: a string
importlib.util.other(arg)  # not reported: another member
