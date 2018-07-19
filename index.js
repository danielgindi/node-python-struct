const Long = require('long');

/**
 *  Copied over from python's notes:

 Optional first char:
 @: native order, size & alignment (default)
 =: native order, std. size & alignment
 <: little-endian, std. size & alignment
 >: big-endian, std. size & alignment
 !: same as >

 The remaining chars indicate types of args and must match exactly;
 these can be preceded by a decimal repeat count:

 x: pad byte (no data)
 c: char
 b: signed byte
 B: unsigned byte
 h: short
 H: unsigned short
 i: int
 I: unsigned int
 l: long
 L: unsigned long
 f: float
 d: double
 s: string (array of char, preceding decimal count indicates length)
 p: pascal string (with count byte, preceding decimal count indicates length)
 P: an integer type that is wide enough to hold a pointer (only available in native format)
 q: long long (not in native mode unless 'long long' in platform C)
 Q: unsigned long long (not in native mode unless 'long long' in platform C)
 ?: boolean
 */

const IS_LITTLE_ENDIAN = require('os').endianness() === 'LE';
const IS_64bit = process.arch === 'x64';

// Maps consist of: size, alignment, unpack function

const UNPACK_STRING = function (data, pos, length) {
    var nextZero = data.indexOf(0, pos);
    return data.slice(pos, Math.min(pos + length, nextZero)).toString('utf8');
};

const PACK_STRING = function (data, pack, pos, length) {
    var written = pack.write(data, pos, length, 'utf8');
    if (written < length) {
        pack.fill(0, pos + written, pos + length);
    }
};

const UNPACK_PASCAL_STRING = function (data, pos, length) {
    var n = data[0];
    if (n >= length) {
        n = length - 1;
    }
    pos ++;
    return data.slice(pos, pos + n).toString('utf8');
};

const PACK_PASCAL_STRING = function (data, pack, pos, length) {
    var bytes = new Buffer(data, 'utf8');
    var n = bytes.length;
    if (n >= length) {
        n = length - 1;
    }
    if (n > 255) {
        n = 255;
    }
    bytes[pos] = n;
    bytes.copy(pack, pos + 1, 0, n);
    pack.fill(0, pos + 1 + n, pos + length);
};

const UNPACK_UINT32_LE = function (data, pos) { return data.readUInt32LE(pos, true) };
const UNPACK_UINT32_BE = function (data, pos) { return data.readUInt32BE(pos, true) };
const UNPACK_INT32_LE = function (data, pos) { return data.readInt32LE(pos, true) };
const UNPACK_INT32_BE = function (data, pos) { return data.readInt32BE(pos, true) };
const PACK_UINT32_LE = function (data, pack, pos) { pack.writeUInt32LE(data, pos, true) };
const PACK_UINT32_BE = function (data, pack, pos) { pack.writeUInt32BE(data, pos, true) };
const PACK_INT32_LE = function (data, pack, pos) { pack.writeInt32LE(data, pos, true) };
const PACK_INT32_BE = function (data, pack, pos) { pack.writeInt32BE(data, pos, true) };

const UNPACK_UINT64_LE = function (data, pos) {
    return Long.fromBits(data.readInt32LE(pos), data.readInt32LE(pos + 4), true);
};

const UNPACK_UINT64_BE = function (data, pos) {
    return Long.fromBits(data.readInt32BE(pos + 4), data.readInt32BE(pos), true);
};

const UNPACK_INT64_LE = function (data, pos) {
    return Long.fromBits(data.readInt32LE(pos), data.readInt32LE(pos + 4), false);
};

const UNPACK_INT64_BE = function (data, pos) {
    return Long.fromBits(data.readInt32BE(pos + 4), data.readInt32BE(pos), false);
};

const PACK_INT64_LE = function (data, pack, pos) {
    if (!(data instanceof Long)) data = Long.fromInt(data);
    pack.writeInt32LE(data.getLowBits(), pos, true);
    pack.writeInt32LE(data.getHighBits(), pos + 4, true);
};

const PACK_INT64_BE = function (data, pack, pos) {
    if (!(data instanceof Long)) data = Long.fromInt(data);
    pack.writeInt32BE(data.getHighBits(), pos, true);
    pack.writeInt32BE(data.getLowBits(), pos + 4, true);
};

const PACK_UINT64_LE = PACK_INT64_LE;

const PACK_UINT64_BE = PACK_INT64_BE;

/**
 * Note: In the "native" map, we do not really have a way (currently) of figuring out
 *       the native size & alignment of things. We default to the "standard" here,
 *       assuming the node.js is always compiled in these architectures.
 */
const NATIVE_MAP = {
    'x': [ 1, 1, null, null ],
    'c': [
        1,
        1,
        function (data, pos) { return String.fromCharCode(data[pos]) },
        function (data, pack, pos) { pack[pos] = data.charCodeAt(0) }
    ],
    'b': [
        1,
        1,
        function (data, pos) { return data.readInt8(pos) },
        function (data, pack, pos) { pack.writeInt8(data, pos, true) }
    ],
    'B': [
        1, 
        1,
        function (data, pos) { return data[pos] },
        function (data, pack, pos) { pack[pos] = data }
    ],
    'h': [
        2,
        2,
        IS_LITTLE_ENDIAN
            ? function (data, pos) { return data.readInt16LE(pos) }
            : function (data, pos) { return data.readInt16BE(pos) },
        IS_LITTLE_ENDIAN
            ? function (data, pack, pos) { return pack.writeInt16LE(data, pos, true) }
            : function (data, pack, pos) { return pack.writeInt16BE(data, pos, true) }
    ],
    'H': [
        2,
        2,
        IS_LITTLE_ENDIAN
            ? function (data, pos) { return data.readUInt16LE(pos) }
            : function (data, pos) { return data.readUInt16BE(pos) },
        IS_LITTLE_ENDIAN
            ? function (data, pack, pos) { return pack.writeUInt16LE(data, pos, true) }
            : function (data, pack, pos) { return pack.writeUInt16BE(data, pos, true) }
    ],
    'i': [
        4,
        4,
        IS_LITTLE_ENDIAN ? UNPACK_INT32_LE : UNPACK_INT32_BE,
        IS_LITTLE_ENDIAN ? PACK_INT32_LE : PACK_INT32_BE
    ],
    'I': [
        4,
        4,
        IS_LITTLE_ENDIAN ? UNPACK_UINT32_LE : UNPACK_UINT32_BE,
        IS_LITTLE_ENDIAN ? PACK_UINT32_LE : PACK_UINT32_BE
    ],
    'l': [
        4,
        4,
        IS_LITTLE_ENDIAN ? UNPACK_INT32_LE : UNPACK_INT32_BE,
        IS_LITTLE_ENDIAN ? PACK_INT32_LE : PACK_INT32_BE
    ],
    'L': [
        4,
        4,
        IS_LITTLE_ENDIAN ? UNPACK_UINT32_LE : UNPACK_UINT32_BE,
        IS_LITTLE_ENDIAN ? PACK_UINT32_LE : PACK_UINT32_BE
    ],
    'f': [
        4,
        4,
        IS_LITTLE_ENDIAN
            ? function (data, pos) { return data.readFloatLE(pos) }
            : function (data, pos) { return data.readFloatBE(pos) },
        IS_LITTLE_ENDIAN
            ? function (data, pack, pos) { return pack.writeFloatLE(data, pos, true) }
            : function (data, pack, pos) { return pack.writeFloatBE(data, pos, true) }
    ],
    'd': [
        8,
        8,
        IS_LITTLE_ENDIAN
            ? function (data, pos) { return data.readDoubleLE(pos) }
            : function (data, pos) { return data.readDoubleBE(pos) },
        IS_LITTLE_ENDIAN
            ? function (data, pack, pos) { return pack.writeDoubleLE(data, pos, true) }
            : function (data, pack, pos) { return pack.writeDoubleBE(data, pos, true) }
    ],
    's': [ 1, 1, UNPACK_STRING, PACK_STRING ],
    'p': [ 1, 1, UNPACK_PASCAL_STRING, PACK_PASCAL_STRING ],
    'P': [
        IS_64bit ? 8 : 4,
        IS_64bit ? 8 : 4,
        IS_LITTLE_ENDIAN ?
            (IS_64bit ? UNPACK_UINT64_LE : UNPACK_UINT32_LE)
            : (IS_64bit ? UNPACK_UINT64_BE : UNPACK_UINT32_BE),
        IS_LITTLE_ENDIAN ?
            (IS_64bit ? PACK_UINT64_LE : PACK_UINT32_LE)
            : (IS_64bit ? PACK_UINT64_BE : PACK_UINT32_BE)
    ],
    'q': [
        8,
        8,
        IS_LITTLE_ENDIAN ? UNPACK_INT64_LE : UNPACK_INT64_BE,
        IS_LITTLE_ENDIAN ? PACK_INT64_LE : PACK_INT64_BE
    ],
    'Q': [
        8,
        8,
        IS_LITTLE_ENDIAN ? UNPACK_UINT64_LE : UNPACK_UINT64_BE,
        IS_LITTLE_ENDIAN ? PACK_UINT64_LE : PACK_UINT64_BE
    ],
    '?': [
        1,
        1,
        function (data, pos) { return data[pos] !== 0},
        function (data, pack, pos) { pack[pos] = data ? 1 : 0 }
    ]
};

const LITTLE_ENDIAN_MAP = {
    'x': [ 1, 1, null, null ],
    'c': [
        1,
        1,
        function (data, pos) { return String.fromCharCode(data[pos]) },
        function (data, pack, pos) { pack[pos] = data.charCodeAt(0) }
    ],
    'b': [
        1,
        1,
        function (data, pos) { return data.readInt8(pos) },
        function (data, pack, pos) { pack.writeInt8(data, pos, true) }
    ],
    'B': [
        1,
        1,
        function (data, pos) { return data[pos] },
        function (data, pack, pos) { pack[pos] = data }
    ],
    'h': [
        2,
        1,
        function (data, pos) { return data.readInt16LE(pos) },
        function (data, pack, pos) { return pack.writeInt16LE(data, pos, true) }
    ],
    'H': [
        2,
        1,
        function (data, pos) { return data.readUInt16LE(pos) },
        function (data, pack, pos) { return pack.writeUInt16LE(data, pos, true) }
    ],
    'i': [ 4, 1, UNPACK_INT32_LE, PACK_INT32_LE ],
    'I': [ 4, 1, UNPACK_UINT32_LE, PACK_UINT32_LE ],
    'l': [ 4, 1, UNPACK_INT32_LE, PACK_INT32_LE ],
    'L': [ 4, 1, UNPACK_UINT32_LE, PACK_UINT32_LE ],
    'f': [
        4,
        1,
        function (data, pos) { return data.readFloatLE(pos) },
        function (data, pack, pos) { return pack.writeFloatLE(data, pos, true) }
    ],
    'd': [
        8,
        1,
        function (data, pos) { return data.readDoubleLE(pos) },
        function (data, pack, pos) { return pack.writeDoubleLE(data, pos, true) }
    ],
    's': [ 1, 1, UNPACK_STRING, PACK_STRING ],
    'p': [ 1, 1, UNPACK_PASCAL_STRING, PACK_PASCAL_STRING ],
    'P': [
        IS_64bit ? 8 : 4,
        1,
        IS_64bit ? UNPACK_UINT64_LE : UNPACK_UINT32_LE,
        IS_64bit ? PACK_UINT64_LE : PACK_UINT32_LE
    ],
    'q': [ 8, 1, UNPACK_INT64_LE, PACK_INT64_LE ],
    'Q': [ 8, 1, UNPACK_UINT64_LE, PACK_UINT64_LE ],
    '?': [
        1,
        1,
        function (data, pos) { return data[pos] !== 0},
        function (data, pack, pos) { pack[pos] = data ? 1 : 0 }
    ]
};

const BIG_ENDIAN_MAP = {
    'x': [ 1, 1, null, null ],
    'c': [
        1,
        1,
        function (data, pos) { return String.fromCharCode(data[pos]) },
        function (data, pack, pos) { pack[pos] = data.charCodeAt(0) }
    ],
    'b': [
        1,
        1,
        function (data, pos) { return data.readInt8(pos) },
        function (data, pack, pos) { pack.writeInt8(data, pos, true) }
    ],
    'B': [
        1,
        1,
        function (data, pos) { return data[pos] },
        function (data, pack, pos) { pack[pos] = data }
    ],
    'h': [
        2,
        1,
        function (data, pos) { return data.readInt16BE(pos) },
        function (data, pack, pos) { return pack.writeInt16BE(data, pos, true) }
    ],
    'H': [
        2,
        1,
        function (data, pos) { return data.readUInt16BE(pos) },
        function (data, pack, pos) { return pack.writeUInt16BE(data, pos, true) }
    ],
    'i': [ 4, 1, UNPACK_INT32_BE, PACK_INT32_BE ],
    'I': [ 4, 1, UNPACK_UINT32_BE, PACK_UINT32_BE ],
    'l': [ 4, 1, UNPACK_INT32_BE, PACK_INT32_BE ],
    'L': [ 4, 1, UNPACK_UINT32_BE, PACK_UINT32_BE ],
    'f': [
        4,
        1,
        function (data, pos) { return data.readFloatBE(pos) },
        function (data, pack, pos) { return pack.writeFloatBE(data, pos, true) }
    ],
    'd': [
        8,
        1,
        function (data, pos) { return data.readDoubleBE(pos) },
        function (data, pack, pos) { return pack.writeDoubleBE(data, pos, true) }
    ],
    's': [ 1, 1, UNPACK_STRING, PACK_STRING ],
    'p': [ 1, 1, UNPACK_PASCAL_STRING, PACK_PASCAL_STRING ],
    'P': [
        IS_64bit ? 8 : 4,
        1,
        IS_64bit ? UNPACK_UINT64_BE : UNPACK_UINT32_BE,
        IS_64bit ? PACK_UINT64_BE : PACK_UINT32_BE
    ],
    'q': [ 8, 1, UNPACK_INT64_BE, PACK_INT64_BE ],
    'Q': [ 8, 1, UNPACK_UINT64_BE, PACK_UINT64_BE ],
    '?': [
        1,
        1,
        function (data, pos) { return data[pos] !== 0},
        function (data, pack, pos) { pack[pos] = data ? 1 : 0 }
    ]
};

var selectMap = function (format) {

    var c = format[0];
    var skipFirst = true;
    var map = NATIVE_MAP;

    switch (c) {
        case '<':
            map = LITTLE_ENDIAN_MAP;
            break;

        case '>':
        case '!':
            map = BIG_ENDIAN_MAP;
            break;

        case '=':
            map = IS_LITTLE_ENDIAN ? LITTLE_ENDIAN_MAP : BIG_ENDIAN_MAP;
            break;

        default:
            skipFirst = false;

        //noinspection FallThroughInSwitchStatementJS
        case '@':
            map = NATIVE_MAP;
            break;
    }

    return {map: map, skipFirst: skipFirst};
};

var PythonStruct = {

    sizeOf: function (format) {

        var size = 0;
        var decimal = null;

        var i = 0, c, len, op, align;
        var selected = selectMap(format);
        var map = selected.map;
        if (selected.skipFirst) {
            i++;
        }

        for (len = format.length; i < len; i++) {
            c = format[i];

            if (c >= '0' && c <= '9') {
                decimal = decimal === null ? c : (decimal + c);
                continue;
            }

            op = map[c];
            if (!op) continue; // Ignore other characters

            // Align position
            align = op[1];
            if (align > 1) {
                size = Math.ceil(size / align) * align;
            }

            // Update size
            decimal = decimal ? parseInt(decimal, 10) : 0;
            if (c === 's') {
                size += decimal || 0;
            } else if (c === 'p') {
                size += decimal || 1;
            } else {
                size += op[0] * (decimal || 1);
            }
            decimal = null;
        }

        return size;
    },

    unpack: function (format, data, checkBounds) {

        var unpacked = [];

        var position = 0;
        var decimal = null;

        var i = 0, c, len, op, size, align, repeat, unpack;
        var selected = selectMap(format);
        var map = selected.map;
        if (selected.skipFirst) {
            i++;
        }

        for (len = format.length; i < len; i++) {
            c = format[i];

            if (c >= '0' && c <= '9') {
                decimal = decimal === null ? c : (decimal + c);
                continue;
            }

            op = map[c];
            if (!op) continue; // Ignore other characters

            size = op[0];
            
            // Align position
            align = op[1];
            if (align > 1) {
                position = Math.ceil(position / align) * align;
            }

            // Unpack
            decimal = decimal ? parseInt(decimal, 10) : 0;
            
            if (c === 's') {
                repeat = 1;
                size = decimal;
            } else if (c === 'p') {
                repeat = 1;
                size = decimal || 1;
            } else {
                repeat = decimal || 1;
            }
            
            unpack = op[2];
            while (repeat > 0) {
				
                if (unpack) {
					
					if (checkBounds) {
                        if (position + size >= data.length) {
                            throw new Error('Reached end of buffer, can\'t unpack anymore data.');
                        }
                    }
                    
                    unpacked.push(unpack(data, position, decimal));
					
					// Update position according to size
					position += size;
                }

                // Decrement repeat count
                repeat--;
            }
            decimal = null;
        }

        return unpacked;
    },

    pack: function (format, data, checkBounds) {
        
        // Support python-style argument array for data
        if (!Array.isArray(data)) {
            data = Array.prototype.slice.call(arguments, 1);
            checkBounds = true;
        }

        var packed = new Buffer(PythonStruct.sizeOf(format));

        var position = 0;
        var decimal = null;

        var i = 0, c, len, op, size, align, repeat, pack;
        var dIndex = 0;
        var selected = selectMap(format);
        var map = selected.map;
        if (selected.skipFirst) {
            i++;
        }

        for (len = format.length; i < len; i++) {
            c = format[i];

            if (c >= '0' && c <= '9') {
                decimal = decimal === null ? c : (decimal + c);
                continue;
            }

            op = map[c];
            if (!op) continue; // Ignore other characters

            size = op[0];

            // Align position
            align = op[1];
            if (align > 1) {
                position = Math.ceil(position / align) * align;
            }

            // Pack
            decimal = decimal ? parseInt(decimal, 10) : 0;
            
            if (c === 's') {
                repeat = 1;
                size = decimal;
            } else if (c === 'p') {
                repeat = 1;
                size = decimal || 1;
            } else {
                repeat = decimal || 1;
            }
            
            pack = op[3];
            while (repeat > 0) {
				
                if (pack) {
					
					if (checkBounds) {
                        if (dIndex >= data.length) {
                            throw new Error('Reached end of data, no more elements to pack.');
                        }
                    }
                    
                    pack(data[dIndex], packed, position, decimal);

                    dIndex++;
                }
                
                // Update position according to size
                position += size;

                // Decrement repeat count
                repeat--;
            }
            decimal = null;
        }

        return packed;
    }

};

module.exports = PythonStruct;

