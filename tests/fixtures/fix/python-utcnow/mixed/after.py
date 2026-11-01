import datetime

stamp = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
broken = datetime.datetime.utcnow(tz)
