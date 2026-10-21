use(require.extensions); // reported: reference to require.extensions
// require.extensions(arg); // not reported: a comment
const note = "require.extensions is deprecated"; // not reported: a string
other(arg); // not reported: another member
