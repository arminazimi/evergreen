const util = require("util");

const value = globalThis;
const nested = { value };

const array = util.isArray(value);
const boolean = util.isBoolean(value);
const buffer = util.isBuffer(value);
const date = util.isDate(value);
const regexp = util.isRegExp(value);
const fn = util.isFunction(value);
const nullValue = util.isNull(value);
const undefinedValue = util.isUndefined(value);
const nullOrUndefined = util.isNullOrUndefined(value);
const number = util.isNumber(value);
const string = util.isString(value);
const symbol = util.isSymbol(value);
const object = util.isObject(nested.value);
const primitive = util.isPrimitive(nested.value);

const negated = !util.isNull(value);
if (util.isNullOrUndefined(value)) {
  throw new TypeError("missing");
}
function check(candidate) {
  return util.isString(candidate);
}
const called = String(util.isNumber(value));
while (util.isUndefined(value)) break;
