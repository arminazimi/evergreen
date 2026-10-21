const os = require("os");

os.tmpDir(arg); // reported: call of os.tmpDir
// os.tmpDir(arg); // not reported: a comment
const note = "os.tmpDir is deprecated"; // not reported: a string
os.other(arg); // not reported: another member
