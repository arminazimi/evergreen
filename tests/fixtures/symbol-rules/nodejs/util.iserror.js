const util = require("util");

util.isError(arg); // reported: call of util.isError
// util.isError(arg); // not reported: a comment
const note = "util.isError is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
