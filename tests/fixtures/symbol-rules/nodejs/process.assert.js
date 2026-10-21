process.assert(arg); // reported: call of process.assert
// process.assert(arg); // not reported: a comment
const note = "process.assert is deprecated"; // not reported: a string
other(arg); // not reported: another member
