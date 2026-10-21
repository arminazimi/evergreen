const timers = require("timers");

timers.active(arg); // reported: call of timers.active
// timers.active(arg); // not reported: a comment
const note = "timers.active is deprecated"; // not reported: a string
timers.other(arg); // not reported: another member
