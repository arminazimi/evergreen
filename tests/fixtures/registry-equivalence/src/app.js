const request = require("request");
const pad = require("left-pad");
request.get("https://example.com", () => pad("x", 5));
