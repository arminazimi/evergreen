const child_process = require("child_process");

child_process.spawn(arg, arg, { customFds: true }); // reported: customFds option of child_process.spawn
child_process.spawnSync(arg, arg, { customFds: true }); // reported: customFds option of child_process.spawnSync
// child_process.spawn(arg); // not reported: a comment
const note = "child_process.spawn is deprecated"; // not reported: a string
child_process.other(arg); // not reported: another member
