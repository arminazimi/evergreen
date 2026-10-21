const fs = require("fs");

use(fs.F_OK); // reported: reference to fs.F_OK
use(fs.R_OK); // reported: reference to fs.R_OK
use(fs.W_OK); // reported: reference to fs.W_OK
use(fs.X_OK); // reported: reference to fs.X_OK
// fs.F_OK(arg); // not reported: a comment
const note = "fs.F_OK is deprecated"; // not reported: a string
fs.other(arg); // not reported: another member
