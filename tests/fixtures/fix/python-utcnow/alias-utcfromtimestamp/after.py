import datetime as dt

stamp = dt.datetime.fromtimestamp(epoch, dt.timezone.utc).replace(tzinfo=None)
