const crypto = require("crypto");

new crypto.Hmac(arg); // reported: construct of crypto.Hmac
crypto.Hmac(arg); // reported: call of crypto.Hmac
// crypto.Hmac(arg); // not reported: a comment
const note = "crypto.Hmac is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
