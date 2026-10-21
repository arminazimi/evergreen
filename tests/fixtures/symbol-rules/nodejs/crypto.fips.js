const crypto = require("crypto");

use(crypto.fips); // reported: reference to crypto.fips
// crypto.fips(arg); // not reported: a comment
const note = "crypto.fips is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
