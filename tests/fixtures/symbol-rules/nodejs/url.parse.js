const url = require("url");
const { parse } = require("url");

url.parse("https://example.com/a"); // reported: call of url.parse
parse("https://example.com/b"); // reported: destructured url.parse
new URL("https://example.com/c"); // not reported: the replacement
JSON.parse("{}"); // not reported: another parse
