const first = new Buffer(10); // reported: construct of Buffer
const second = Buffer("abc"); // reported: call of Buffer
const third = Buffer.from("abc"); // not reported: the replacement
const fourth = Buffer.alloc(10); // not reported: the replacement
function Buffer2() {} // not reported: an unrelated name
