from datetime import datetime, timezone

stamp = datetime.fromtimestamp(1234, timezone.utc).replace(tzinfo=None)
