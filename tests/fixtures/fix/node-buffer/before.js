const { SlowBuffer } = require("buffer");

const sized = new Buffer(5);
const allocated = Buffer(4);
const copied = Buffer("hello");
const encoded = new Buffer("aGVsbG8=", "base64");
const fromArray = new Buffer([1, 2, 3]);
const copiedArray = Buffer([4, 5]);
const template = new Buffer(`hello`);
const nested = new Buffer([Buffer(1)]);
const slow = new SlowBuffer(16);
