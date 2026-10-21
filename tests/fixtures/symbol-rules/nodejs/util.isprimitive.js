const util = require("util");

util.isPrimitive(arg); // reported: call of util.isPrimitive
// util.isPrimitive(arg); // not reported: a comment
const note = "util.isPrimitive is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
