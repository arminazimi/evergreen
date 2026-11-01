// @ts-nocheck
import * as util from "node:util";

const value: unknown = globalThis;
const nested: { value: unknown } = { value };

const array: boolean = Array.isArray(value);
const boolean: boolean = typeof value === "boolean";
const buffer: boolean = Buffer.isBuffer(value);
const date: boolean = util.types.isDate(value);
const regexp: boolean = util.types.isRegExp(value);
const fn: boolean = typeof value === "function";
const nullValue: boolean = value === null;
const undefinedValue: boolean = value === undefined;
const nullOrUndefined: boolean = value == null;
const number: boolean = typeof value === "number";
const string: boolean = typeof value === "string";
const symbol: boolean = typeof value === "symbol";
const object: boolean = nested.value !== null && typeof nested.value === "object";
const primitive: boolean = nested.value === null || (typeof nested.value !== "object" && typeof nested.value !== "function");

const negated: boolean = !(value === null);
const asserted = (value === null) as boolean;
if (value == null) {
  throw new TypeError("missing");
}
function check(candidate: unknown): boolean {
  return typeof candidate === "string";
}
