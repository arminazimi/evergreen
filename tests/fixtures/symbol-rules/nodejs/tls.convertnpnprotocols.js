const tls = require("tls");

tls.convertNPNProtocols(arg); // reported: call of tls.convertNPNProtocols
// tls.convertNPNProtocols(arg); // not reported: a comment
const note = "tls.convertNPNProtocols is deprecated"; // not reported: a string
tls.other(arg); // not reported: another member
