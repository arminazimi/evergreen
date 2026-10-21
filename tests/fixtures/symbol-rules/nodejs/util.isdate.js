const util = require("util");

util.isDate(arg); // reported: call of util.isDate
// util.isDate(arg); // not reported: a comment
const note = "util.isDate is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
