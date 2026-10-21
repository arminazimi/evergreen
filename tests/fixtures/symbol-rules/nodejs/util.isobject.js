const util = require("util");

util.isObject(arg); // reported: call of util.isObject
// util.isObject(arg); // not reported: a comment
const note = "util.isObject is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
