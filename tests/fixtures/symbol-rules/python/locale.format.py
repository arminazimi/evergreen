import locale

locale.format(arg)  # reported: call of locale.format
# locale.format(arg)  # not reported: a comment
note = "locale.format"  # not reported: a string
locale.other(arg)  # not reported: another member
