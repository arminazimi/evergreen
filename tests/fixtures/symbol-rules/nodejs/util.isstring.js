const { isString } = require("util");

isString("a"); // reported: destructured util.isString
typeof "a" === "string"; // not reported: the replacement
const local = (value) => typeof value === "string";
local("a"); // not reported: an unrelated function
