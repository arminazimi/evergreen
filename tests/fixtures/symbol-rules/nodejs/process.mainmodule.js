use(process.mainModule); // reported: reference to process.mainModule
// process.mainModule(arg); // not reported: a comment
const note = "process.mainModule is deprecated"; // not reported: a string
other(arg); // not reported: another member
