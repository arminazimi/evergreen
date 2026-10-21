const util = require("util");

util.isBuffer(arg); // reported: call of util.isBuffer
// util.isBuffer(arg); // not reported: a comment
const note = "util.isBuffer is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
