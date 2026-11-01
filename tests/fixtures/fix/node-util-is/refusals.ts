// @ts-nocheck
import * as util from "node:util";

function getValue(): unknown {
  return globalThis;
}

const error = util.isError(getValue());
const object = util.isObject(getValue());
const spread = util.isString(...[getValue()]);
const optional = util.isNull?.(getValue());
const missing = util.isArray();
const extra = util.isUndefined(getValue(), getValue());

let check = util.isArray;
check = () => true;
const reassigned = check(getValue());
