const assert = require("assert");

new assert.CallTracker(arg); // reported: construct of assert.CallTracker
// assert.CallTracker(arg); // not reported: a comment
const note = "assert.CallTracker is deprecated"; // not reported: a string
assert.other(arg); // not reported: another member
