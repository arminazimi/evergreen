const vm = require("vm");

vm.runInDebugContext(arg); // reported: call of vm.runInDebugContext
// vm.runInDebugContext(arg); // not reported: a comment
const note = "vm.runInDebugContext is deprecated"; // not reported: a string
vm.other(arg); // not reported: another member
