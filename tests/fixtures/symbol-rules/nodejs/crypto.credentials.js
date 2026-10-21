const crypto = require("crypto");

new crypto.Credentials(arg); // reported: construct of crypto.Credentials
// crypto.Credentials(arg); // not reported: a comment
const note = "crypto.Credentials is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
