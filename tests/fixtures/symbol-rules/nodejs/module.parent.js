use(module.parent); // reported: reference to module.parent
// module.parent(arg); // not reported: a comment
const note = "module.parent is deprecated"; // not reported: a string
other(arg); // not reported: another member
