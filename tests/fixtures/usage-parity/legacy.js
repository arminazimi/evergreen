const request = require("request");
const { post: send } = require("request");
const moment = require("moment");

request.get("https://example.com/a");
send({ url: "https://example.com/b" });
console.log(moment().format("YYYY"));

// request.get("commented out");
const note = "request.post is deprecated";
