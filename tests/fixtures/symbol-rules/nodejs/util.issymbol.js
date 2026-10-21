const util = require("util");

util.isSymbol(arg); // reported: call of util.isSymbol
// util.isSymbol(arg); // not reported: a comment
const note = "util.isSymbol is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
