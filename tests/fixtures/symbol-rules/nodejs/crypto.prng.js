const crypto = require("crypto");

crypto.prng(arg); // reported: call of crypto.prng
crypto.pseudoRandomBytes(arg); // reported: call of crypto.pseudoRandomBytes
crypto.rng(arg); // reported: call of crypto.rng
// crypto.prng(arg); // not reported: a comment
const note = "crypto.prng is deprecated"; // not reported: a string
crypto.other(arg); // not reported: another member
