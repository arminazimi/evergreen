const util = require("util");

util.isRegExp(arg); // reported: call of util.isRegExp
// util.isRegExp(arg); // not reported: a comment
const note = "util.isRegExp is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
