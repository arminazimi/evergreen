import datetime

stamp = datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).replace(tzinfo=None)
