const crypto = require("crypto");

crypto.createCipher("aes192", "password"); // reported: call of crypto.createCipher
crypto.createDecipher("aes192", "password"); // reported: call of crypto.createDecipher
crypto.createCipheriv("aes-256-cbc", key, iv); // not reported: the replacement
