const repl = require("repl");

use(repl._builtinLibs); // reported: reference to repl._builtinLibs
// repl._builtinLibs(arg); // not reported: a comment
const note = "repl._builtinLibs is deprecated"; // not reported: a string
repl.other(arg); // not reported: another member
