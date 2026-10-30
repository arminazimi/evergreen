const { SlowBuffer } = require("buffer");
const buffer = require("buffer");
const value = 5;

new Buffer(value);
new Buffer(value * 2);
new Buffer(5, 0, 2);
new Buffer(`hi ${value}`);
new buffer.SlowBuffer(5);
SlowBuffer(5);
