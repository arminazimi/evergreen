// @ts-nocheck
import { SlowBuffer } from "buffer";

const sized: Buffer = Buffer.alloc(5);
const allocated: Buffer = Buffer.alloc(4);
const copied: Buffer = Buffer.from("hello");
const encoded: Buffer = Buffer.from("aGVsbG8=", "base64");
const fromArray: Buffer = Buffer.from([1, 2, 3]);
const copiedArray: Buffer = Buffer.from([4, 5]);
const template: Buffer = Buffer.from(`hello`);
const slow = Buffer.allocUnsafeSlow(16);
