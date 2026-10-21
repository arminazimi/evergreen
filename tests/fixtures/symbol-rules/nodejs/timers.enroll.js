const timers = require("timers");

timers.enroll(arg); // reported: call of timers.enroll
// timers.enroll(arg); // not reported: a comment
const note = "timers.enroll is deprecated"; // not reported: a string
timers.other(arg); // not reported: another member
