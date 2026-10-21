import sysconfig

sysconfig.expand_makefile_vars(arg)  # reported: call of sysconfig.expand_makefile_vars
# sysconfig.expand_makefile_vars(arg)  # not reported: a comment
note = "sysconfig.expand_makefile_vars"  # not reported: a string
sysconfig.other(arg)  # not reported: another member
