const crypto = require("crypto");

use(crypto.DEFAULT_ENCODING); // reported: reference to crypto.DEFAULT_ENCODING
// crypto.DEFAULT_ENCODING(arg); // not reported: a comment
const note = "crypto.DEFAULT_ENCODING is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
