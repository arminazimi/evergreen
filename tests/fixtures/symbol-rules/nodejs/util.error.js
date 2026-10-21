const util = require("util");

util.error(arg); // reported: call of util.error
// util.error(arg); // not reported: a comment
const note = "util.error is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
