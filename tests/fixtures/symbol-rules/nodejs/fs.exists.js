const fs = require("fs");
const { exists } = require("fs");

fs.exists("a.txt", () => {}); // reported: call of fs.exists
exists("b.txt", () => {}); // reported: destructured fs.exists
fs.existsSync("a.txt"); // not reported: a different symbol
fs.access("a.txt", () => {}); // not reported: the replacement
const note = "fs.exists is deprecated"; // not reported: a string
