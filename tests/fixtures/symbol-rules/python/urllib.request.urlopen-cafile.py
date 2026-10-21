import urllib.request

urllib.request.urlopen(arg, cafile=value)  # reported: cafile option of urllib.request.urlopen
urllib.request.urlopen(arg, capath=value)  # reported: capath option of urllib.request.urlopen
urllib.request.urlopen(arg, cadefault=value)  # reported: cadefault option of urllib.request.urlopen
# urllib.request.urlopen(arg)  # not reported: a comment
note = "urllib.request.urlopen"  # not reported: a string
urllib.request.other(arg)  # not reported: another member
