const util = require("util");

util.isNullOrUndefined(arg); // reported: call of util.isNullOrUndefined
// util.isNullOrUndefined(arg); // not reported: a comment
const note = "util.isNullOrUndefined is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
