const tls = require("tls");

tls.parseCertString(arg); // reported: call of tls.parseCertString
// tls.parseCertString(arg); // not reported: a comment
const note = "tls.parseCertString is deprecated"; // not reported: a string
tls.other(arg); // not reported: another member
