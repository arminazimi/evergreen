const util = require("util");

util.isFunction(arg); // reported: call of util.isFunction
// util.isFunction(arg); // not reported: a comment
const note = "util.isFunction is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
