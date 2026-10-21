const util = require("util");

util.debug(arg); // reported: call of util.debug
// util.debug(arg); // not reported: a comment
const note = "util.debug is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
