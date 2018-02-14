'use strict';

// Conversion of 32bit binary to Float 32

const struct = require('python-struct');

const binary = '01000010010001110000000000000000';

const intValue = parseInt(binary, 2);
const result = struct.unpack('f', struct.pack('I', intValue))

console.log(result[0]);
