const async_hooks = require("async_hooks");

async_hooks.triggerId(arg); // reported: call of async_hooks.triggerId
// async_hooks.triggerId(arg); // not reported: a comment
const note = "async_hooks.triggerId is deprecated"; // not reported: a string
async_hooks.other(arg); // not reported: another member
