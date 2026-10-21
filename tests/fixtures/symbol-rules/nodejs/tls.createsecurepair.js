const tls = require("tls");

tls.createSecurePair(context); // reported: call of tls.createSecurePair
new tls.TLSSocket(socket); // not reported: the replacement
tls.connect(443); // not reported: another tls member
