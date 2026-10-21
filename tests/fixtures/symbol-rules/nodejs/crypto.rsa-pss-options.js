const crypto = require("crypto");

crypto.generateKeyPair(arg, { hash: true }); // reported: hash option of crypto.generateKeyPair
crypto.generateKeyPair(arg, { mgf1Hash: true }); // reported: mgf1Hash option of crypto.generateKeyPair
crypto.generateKeyPairSync(arg, { hash: true }); // reported: hash option of crypto.generateKeyPairSync
crypto.generateKeyPairSync(arg, { mgf1Hash: true }); // reported: mgf1Hash option of crypto.generateKeyPairSync
// crypto.generateKeyPair(arg); // not reported: a comment
const note = "crypto.generateKeyPair is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
