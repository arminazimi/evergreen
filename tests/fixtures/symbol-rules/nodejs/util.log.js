const util = require("util");

util.log(arg); // reported: call of util.log
// util.log(arg); // not reported: a comment
const note = "util.log is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
