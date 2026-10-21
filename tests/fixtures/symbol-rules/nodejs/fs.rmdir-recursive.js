const fs = require("fs");

fs.rmdir("dir", { recursive: true }, () => {}); // reported: recursive option of fs.rmdir
fs.rmdirSync("dir", { recursive: true }); // reported: recursive option of fs.rmdirSync
fs.rmdir("dir", () => {}); // not reported: no recursive option
fs.rm("dir", { recursive: true, force: true }, () => {}); // not reported: the replacement
