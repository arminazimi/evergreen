const util = require("util");

util.isUndefined(arg); // reported: call of util.isUndefined
// util.isUndefined(arg); // not reported: a comment
const note = "util.isUndefined is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
