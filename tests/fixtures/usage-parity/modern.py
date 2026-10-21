import requests as http
import requests; import yaml

# Forms only the parser sees: several statements on a line, aliases, and multi-line calls.
fetch = http.get
fetch("https://example.com")
yaml.safe_load("a: 1")

http.post(
    "https://example.com",
    data={},
)
