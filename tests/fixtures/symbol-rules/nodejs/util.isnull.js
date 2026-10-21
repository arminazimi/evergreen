const util = require("util");

util.isNull(arg); // reported: call of util.isNull
// util.isNull(arg); // not reported: a comment
const note = "util.isNull is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
