// A service that still calls Node.js core APIs later releases removed or deprecated.
const util = require("node:util");

util.isString("text");
util.isArray([]);

module.exports = { isString: util.isString, isArray: util.isArray };
