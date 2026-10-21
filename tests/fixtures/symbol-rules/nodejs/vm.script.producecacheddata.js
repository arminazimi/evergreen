const vm = require("vm");

vm.Script(arg, { produceCachedData: true }); // reported: produceCachedData option of vm.Script
// vm.Script(arg); // not reported: a comment
const note = "vm.Script is deprecated"; // not reported: a string
vm.other(arg); // not reported: another member
