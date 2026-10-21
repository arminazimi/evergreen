const util = require("util");

util.types.isNativeError(arg); // reported: call of util.types.isNativeError
// util.types.isNativeError(arg); // not reported: a comment
const note = "util.types.isNativeError is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
