const { SlowBuffer } = require("buffer");

const sized = Buffer.alloc(5);
const allocated = Buffer.alloc(4);
const copied = Buffer.from("hello");
const encoded = Buffer.from("aGVsbG8=", "base64");
const fromArray = Buffer.from([1, 2, 3]);
const copiedArray = Buffer.from([4, 5]);
const template = Buffer.from(`hello`);
const nested = Buffer.from([Buffer.alloc(1)]);
const slow = Buffer.allocUnsafeSlow(16);
