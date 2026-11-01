// @ts-nocheck
import * as util from "node:util";

const value: unknown = globalThis;
const nested: { value: unknown } = { value };

const array: boolean = util.isArray(value);
const boolean: boolean = util.isBoolean(value);
const buffer: boolean = util.isBuffer(value);
const date: boolean = util.isDate(value);
const regexp: boolean = util.isRegExp(value);
const fn: boolean = util.isFunction(value);
const nullValue: boolean = util.isNull(value);
const undefinedValue: boolean = util.isUndefined(value);
const nullOrUndefined: boolean = util.isNullOrUndefined(value);
const number: boolean = util.isNumber(value);
const string: boolean = util.isString(value);
const symbol: boolean = util.isSymbol(value);
const object: boolean = util.isObject(nested.value);
const primitive: boolean = util.isPrimitive(nested.value);

const negated: boolean = !util.isNull(value);
const asserted = util.isNull(value) as boolean;
if (util.isNullOrUndefined(value)) {
  throw new TypeError("missing");
}
function check(candidate: unknown): boolean {
  return util.isString(candidate);
}
