import datetime
from datetime import datetime as dt

datetime.datetime.utcnow()  # reported: call of datetime.datetime.utcnow
dt.utcnow()  # reported: call through a from-import
datetime.datetime.now(datetime.UTC)  # not reported: the replacement
datetime.datetime.utcoffset  # not reported: a different attribute
note = "datetime.utcnow() is deprecated"  # not reported: a string
