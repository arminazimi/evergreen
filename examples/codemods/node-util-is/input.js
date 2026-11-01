const util = require("util");

const value = load();

const array = util.isArray(value);
const date = util.isDate(value);
const object = util.isObject(value);
const missing = util.isNullOrUndefined(value);
const primitive = util.isPrimitive(value);
