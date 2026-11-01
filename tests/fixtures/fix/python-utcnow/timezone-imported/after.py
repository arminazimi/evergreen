from datetime import datetime, timezone

stamp = datetime.now(timezone.utc).replace(tzinfo=None)
earlier = datetime.fromtimestamp(99, timezone.utc).replace(tzinfo=None)
