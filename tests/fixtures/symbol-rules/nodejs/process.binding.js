process.binding("fs"); // reported: call of process.binding
process.cwd(); // not reported: another process member
const holder = { binding() {} };
holder.binding(); // not reported: another receiver
