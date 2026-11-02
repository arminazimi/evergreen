// A module that uses the replacement APIs only, so no Node.js symbol rule matches.
const fs = require("node:fs");

fs.access("note.txt", () => {});
Array.isArray([]);
