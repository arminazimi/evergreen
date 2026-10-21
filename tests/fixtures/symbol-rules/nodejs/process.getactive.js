process._getActiveRequests(arg); // reported: call of process._getActiveRequests
process._getActiveHandles(arg); // reported: call of process._getActiveHandles
// process._getActiveRequests(arg); // not reported: a comment
const note = "process._getActiveRequests is deprecated"; // not reported: a string
other(arg); // not reported: another member
