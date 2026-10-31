const { SlowBuffer } = require("buffer");

const sized = new Buffer(8);
const copied = Buffer("hello");
const encoded = new Buffer("aGVsbG8=", "base64");
const fromArray = new Buffer([1, 2, 3]);
const slow = new SlowBuffer(16);
