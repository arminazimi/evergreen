const module = require("module");

module.createRequireFromPath(arg); // reported: call of module.createRequireFromPath
// module.createRequireFromPath(arg); // not reported: a comment
const note = "module.createRequireFromPath is deprecated"; // not reported: a string
module.other(arg); // not reported: another member
