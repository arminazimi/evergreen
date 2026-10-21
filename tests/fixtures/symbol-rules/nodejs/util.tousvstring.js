const util = require("util");

util.toUSVString(arg); // reported: call of util.toUSVString
// util.toUSVString(arg); // not reported: a comment
const note = "util.toUSVString is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
