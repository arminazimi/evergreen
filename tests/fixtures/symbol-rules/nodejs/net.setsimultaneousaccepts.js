const net = require("net");

net._setSimultaneousAccepts(arg); // reported: call of net._setSimultaneousAccepts
// net._setSimultaneousAccepts(arg); // not reported: a comment
const note = "net._setSimultaneousAccepts is deprecated"; // not reported: a string
net.other(arg); // not reported: another member
