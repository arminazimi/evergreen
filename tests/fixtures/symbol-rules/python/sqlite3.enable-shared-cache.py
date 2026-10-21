import sqlite3

sqlite3.enable_shared_cache(arg)  # reported: call of sqlite3.enable_shared_cache
# sqlite3.enable_shared_cache(arg)  # not reported: a comment
note = "sqlite3.enable_shared_cache"  # not reported: a string
sqlite3.other(arg)  # not reported: another member
