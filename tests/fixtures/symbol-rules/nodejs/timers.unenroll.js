const timers = require("timers");

timers.unenroll(arg); // reported: call of timers.unenroll
// timers.unenroll(arg); // not reported: a comment
const note = "timers.unenroll is deprecated"; // not reported: a string
timers.other(arg); // not reported: another member
