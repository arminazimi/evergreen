use(Intl.v8BreakIterator); // reported: reference to Intl.v8BreakIterator
// Intl.v8BreakIterator(arg); // not reported: a comment
const note = "Intl.v8BreakIterator is deprecated"; // not reported: a string
other(arg); // not reported: another member
