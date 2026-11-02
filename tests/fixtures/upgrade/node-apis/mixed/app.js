// A module that still calls Node.js core APIs later releases removed or deprecated.
const util = require("node:util");

util.isString("text");
util.isArray([]);
util.types.isNativeError(new Error("x"));
