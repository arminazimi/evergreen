import locale

locale.getdefaultlocale()  # reported: call of locale.getdefaultlocale
locale.getlocale()  # not reported: the replacement
locale.getpreferredencoding(False)  # not reported: the replacement
