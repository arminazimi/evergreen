const util = require("util");

function getValue() {
  return globalThis;
}

const error = util.isError(getValue());
const object = util.isObject(getValue());
const chained = util.isObject(getValue().value);
const spread = util.isArray(...[getValue()]);
const optional = util.isArray?.(getValue());
const missing = util.isNull();
const extra = util.isNull(getValue(), getValue());

let check = util.isArray;
check = () => true;
const reassigned = check(getValue());
