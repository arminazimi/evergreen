const fs = require("fs");

new fs.Stats(arg); // reported: construct of fs.Stats
fs.Stats(arg); // reported: call of fs.Stats
// fs.Stats(arg); // not reported: a comment
const note = "fs.Stats is deprecated"; // not reported: a string
fs.other(arg); // not reported: another member
