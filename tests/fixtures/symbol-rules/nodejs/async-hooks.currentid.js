const async_hooks = require("async_hooks");

async_hooks.currentId(arg); // reported: call of async_hooks.currentId
// async_hooks.currentId(arg); // not reported: a comment
const note = "async_hooks.currentId is deprecated"; // not reported: a string
async_hooks.other(arg); // not reported: another member
