import requests
import requests.adapters
from requests import get, post as send
import yaml

requests.get("https://example.com/a")
get("https://example.com/b")
send("https://example.com/c")
yaml.load(open("config.yml"))

# requests.get("commented out")
note = "requests.post() is deprecated"
