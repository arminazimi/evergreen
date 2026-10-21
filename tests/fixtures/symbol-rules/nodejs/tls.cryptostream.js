const tls = require("tls");

new tls.CryptoStream(arg); // reported: construct of tls.CryptoStream
// tls.CryptoStream(arg); // not reported: a comment
const note = "tls.CryptoStream is deprecated"; // not reported: a string
tls.other(arg); // not reported: another member
