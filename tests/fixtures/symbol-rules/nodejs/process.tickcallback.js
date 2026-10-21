use(process._tickCallback); // reported: reference to process._tickCallback
// process._tickCallback(arg); // not reported: a comment
const note = "process._tickCallback is deprecated"; // not reported: a string
other(arg); // not reported: another member
