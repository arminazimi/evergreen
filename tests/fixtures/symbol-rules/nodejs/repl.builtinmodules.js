const repl = require("repl");

use(repl.builtinModules); // reported: reference to repl.builtinModules
// repl.builtinModules(arg); // not reported: a comment
const note = "repl.builtinModules is deprecated"; // not reported: a string
repl.other(arg); // not reported: another member
