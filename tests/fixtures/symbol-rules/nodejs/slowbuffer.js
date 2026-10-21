const buffer = require("buffer");

new buffer.SlowBuffer(arg); // reported: construct of buffer.SlowBuffer
buffer.SlowBuffer(arg); // reported: call of buffer.SlowBuffer
// buffer.SlowBuffer(arg); // not reported: a comment
const note = "buffer.SlowBuffer is deprecated"; // not reported: a string
buffer.other(arg); // not reported: another member
