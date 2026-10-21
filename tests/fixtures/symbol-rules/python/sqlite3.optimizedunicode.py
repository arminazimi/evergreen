import sqlite3

use(sqlite3.OptimizedUnicode)  # reported: reference to sqlite3.OptimizedUnicode
# sqlite3.OptimizedUnicode(arg)  # not reported: a comment
note = "sqlite3.OptimizedUnicode"  # not reported: a string
sqlite3.other(arg)  # not reported: another member
