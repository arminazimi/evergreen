import locale

locale.resetlocale(arg)  # reported: call of locale.resetlocale
# locale.resetlocale(arg)  # not reported: a comment
note = "locale.resetlocale"  # not reported: a string
locale.other(arg)  # not reported: another member
