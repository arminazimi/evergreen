const util = require("util");

util._extend({}, { a: 1 }); // reported: call of util._extend
Object.assign({}, { a: 1 }); // not reported: the replacement
// util._extend({}, {}); // not reported: a comment
