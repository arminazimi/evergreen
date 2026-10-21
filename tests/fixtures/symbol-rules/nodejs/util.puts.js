const util = require("util");

util.puts(arg); // reported: call of util.puts
// util.puts(arg); // not reported: a comment
const note = "util.puts is deprecated"; // not reported: a string
util.other(arg); // not reported: another member
