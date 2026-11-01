const util = require("util");

const value = globalThis;
const nested = { value };

const array = Array.isArray(value);
const boolean = typeof value === "boolean";
const buffer = Buffer.isBuffer(value);
const date = util.types.isDate(value);
const regexp = util.types.isRegExp(value);
const fn = typeof value === "function";
const nullValue = value === null;
const undefinedValue = value === undefined;
const nullOrUndefined = value == null;
const number = typeof value === "number";
const string = typeof value === "string";
const symbol = typeof value === "symbol";
const object = nested.value !== null && typeof nested.value === "object";
const primitive = nested.value === null || (typeof nested.value !== "object" && typeof nested.value !== "function");

const negated = !(value === null);
if (value == null) {
  throw new TypeError("missing");
}
function check(candidate) {
  return typeof candidate === "string";
}
const called = String(typeof value === "number");
while (value === undefined) break;
