const util = require("util");

util.isNumber(arg); // reported: call of util.isNumber
// util.isNumber(arg); // not reported: a comment
const note = "util.isNumber is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
