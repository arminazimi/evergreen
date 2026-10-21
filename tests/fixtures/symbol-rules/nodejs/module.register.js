const module = require("module");

module.register(arg); // reported: call of module.register
// module.register(arg); // not reported: a comment
const note = "module.register is deprecated"; // not reported: a string
module.other(arg); // not reported: another member
