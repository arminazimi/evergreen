from datetime import datetime, timezone

stamp = datetime.utcnow(tz)
empty = datetime.utcfromtimestamp()
named = datetime.utcfromtimestamp(t=1)
spread = datetime.utcfromtimestamp(*parts)
