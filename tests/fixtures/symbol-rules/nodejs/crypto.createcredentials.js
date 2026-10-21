const crypto = require("crypto");

crypto.createCredentials(arg); // reported: call of crypto.createCredentials
// crypto.createCredentials(arg); // not reported: a comment
const note = "crypto.createCredentials is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
