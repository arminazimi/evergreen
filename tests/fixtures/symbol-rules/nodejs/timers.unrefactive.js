const timers = require("timers");

timers._unrefActive(arg); // reported: call of timers._unrefActive
// timers._unrefActive(arg); // not reported: a comment
const note = "timers._unrefActive is deprecated"; // not reported: a string
timers.other(arg); // not reported: another member
