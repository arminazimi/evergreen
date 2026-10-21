const util = require("util");

util.isBoolean(arg); // reported: call of util.isBoolean
// util.isBoolean(arg); // not reported: a comment
const note = "util.isBoolean is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
