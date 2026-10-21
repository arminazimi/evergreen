const crypto = require("crypto");

new crypto.Certificate(arg); // reported: construct of crypto.Certificate
// crypto.Certificate(arg); // not reported: a comment
const note = "crypto.Certificate is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
