from datetime import datetime, timezone

stamp = datetime.now(timezone.utc).replace(tzinfo=None)
