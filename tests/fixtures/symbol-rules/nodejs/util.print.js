const util = require("util");

util.print(arg); // reported: call of util.print
// util.print(arg); // not reported: a comment
const note = "util.print is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
