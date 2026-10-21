const fs = require("fs");

fs.lchmod(arg); // reported: call of fs.lchmod
fs.lchmodSync(arg); // reported: call of fs.lchmodSync
// fs.lchmod(arg); // not reported: a comment
const note = "fs.lchmod is deprecated"; // not reported: a string
fs.other(arg); // not reported: another member
