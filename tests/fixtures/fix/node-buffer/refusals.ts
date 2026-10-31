// @ts-nocheck
const value = 5;

new Buffer(value as number);
new Buffer(value!);
new Buffer(<number>value);
