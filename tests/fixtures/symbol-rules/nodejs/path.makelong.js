const path = require("path");

path._makeLong(arg); // reported: call of path._makeLong
// path._makeLong(arg); // not reported: a comment
const note = "path._makeLong is deprecated"; // not reported: a string
path.other(arg); // not reported: another member
