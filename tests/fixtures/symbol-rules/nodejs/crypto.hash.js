const crypto = require("crypto");

new crypto.Hash(arg); // reported: construct of crypto.Hash
crypto.Hash(arg); // reported: call of crypto.Hash
// crypto.Hash(arg); // not reported: a comment
const note = "crypto.Hash is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
