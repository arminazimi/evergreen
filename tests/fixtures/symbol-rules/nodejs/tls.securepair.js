const tls = require("tls");

new tls.SecurePair(arg); // reported: construct of tls.SecurePair
// tls.SecurePair(arg); // not reported: a comment
const note = "tls.SecurePair is deprecated"; // not reported: a string
tls.other(arg); // not reported: another member
