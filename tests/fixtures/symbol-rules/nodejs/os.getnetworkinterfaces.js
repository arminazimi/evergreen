const os = require("os");

os.getNetworkInterfaces(arg); // reported: call of os.getNetworkInterfaces
// os.getNetworkInterfaces(arg); // not reported: a comment
const note = "os.getNetworkInterfaces is deprecated"; // not reported: a string
os.other(arg); // not reported: another member
