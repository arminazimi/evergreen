const util = require("util");

util.isArray([]); // reported: call of util.isArray
Array.isArray([]); // not reported: the replacement
const other = { isArray() {} };
other.isArray(); // not reported: another receiver
