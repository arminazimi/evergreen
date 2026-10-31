// @ts-nocheck
import { SlowBuffer } from "buffer";

const sized: Buffer = new Buffer(5);
const allocated: Buffer = Buffer(4);
const copied: Buffer = Buffer("hello");
const encoded: Buffer = new Buffer("aGVsbG8=", "base64");
const fromArray: Buffer = new Buffer([1, 2, 3]);
const copiedArray: Buffer = Buffer([4, 5]);
const template: Buffer = new Buffer(`hello`);
const slow = new SlowBuffer(16);
