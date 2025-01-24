class ParamUsage {
    constructor(paramIndex, wordIndex, shift, mask) {
        this.paramIndex = paramIndex;
        this.wordIndex = wordIndex;
        this.shift = shift;
        this.mask = mask;
    }
    static generateUsages(params, opcode) {
        const usages = [];
        let currentChar = '';
        const shifts = Array(params.length).fill(0);
        let curPos = 0;
        let startPos = 0;
        const numWords = opcode.length / 16;
        const baseWords = Array(numWords).fill(0);
        while (curPos < opcode.length) {
            const c = opcode.charAt(opcode.length - 1 - curPos);
            if (c !== currentChar || curPos % 16 === 0) {
                if (currentChar !== '') {
                    const parIndex = params.indexOf(currentChar);
                    let lIndex = curPos % 16;
                    if (lIndex === 0)
                        lIndex = 16;
                    const rIndex = startPos % 16;
                    const shift = rIndex - shifts[parIndex];
                    const mask = (1 << lIndex) - (1 << rIndex);
                    const wordIndex = numWords - 1 - Math.floor(startPos / 16);
                    usages.push(new ParamUsage(parIndex, wordIndex, shift, mask));
                    shifts[parIndex] += lIndex - rIndex;
                }
                currentChar = c;
                if (c === '0' || c === '1') {
                    currentChar = '';
                    if (c === '1') {
                        baseWords[numWords - 1 - Math.floor(curPos / 16)] |= 1 << (curPos % 16);
                    }
                }
                startPos = curPos;
            }
            curPos += 1;
        }
        if (currentChar !== '') {
            const parIndex = params.indexOf(currentChar);
            let lIndex = curPos % 16;
            if (lIndex === 0)
                lIndex = 16;
            const rIndex = startPos % 16;
            const shift = rIndex - shifts[parIndex];
            const mask = (1 << lIndex) - (1 << rIndex);
            const wordIndex = numWords - 1 - Math.floor(startPos / 16);
            usages.push(new ParamUsage(parIndex, wordIndex, shift, mask));
            shifts[parIndex] += lIndex - rIndex;
        }
        // console.log(usages)
        // console.log(baseWords)
        return [usages, baseWords];
    }
}
class LabelUsage {
    constructor(label, index, shift, mask, offset) {
        this.label = label;
        this.index = index;
        this.shift = shift;
        this.mask = mask;
        this.offset = offset;
    }
    evaluate(labels) {
        let answer = labels[this.label] - this.offset;
        if (this.shift < 0) {
            answer >>>= -this.shift;
        }
        else {
            answer <<= this.shift;
        }
        answer &= this.mask;
        return answer;
    }
}
// Abstract base class for all encoders
class Encoder {
    static parseNumber(x) {
        if (x[0] == '$') {
            return parseInt(x.substring(1));
        }
        else {
            return parseInt(x);
        }
    }
}
class GeneralEncoder extends Encoder {
    constructor(name, params, opcode, ...paramTypes) {
        super();
        this.name = name;
        const parsedOpcode = ParamUsage.generateUsages(params, opcode);
        this.paramUsages = parsedOpcode[0];
        this.baseWords = parsedOpcode[1];
        this.paramTypes = paramTypes;
        if (paramTypes.length !== params.length) {
            console.error(`Parameter count mismatch when creating ${this.name}, params.length = ${params.length}, paramTypes.length = ${paramTypes.length}`);
        }
    }
    encode(params, index, labelUsages, outputArray, constants) {
        const opcode = this.baseWords.slice();
        if (params.length !== this.paramTypes.length) {
            console.error(`Could not encode ${this.name} ${params.join(', ')}: expected ${this.paramTypes.length} parameters, received ${params.length}`);
            return;
        }
        const paramValues = [];
        const isLabel = [];
        for (let i = 0; i < params.length; i++) {
            const p = constants[params[i]] || params[i];
            const t = this.paramTypes[i];
            let pValue = 0;
            let useLabel = false;
            switch (t[0]) {
                case 'register':
                    pValue = parseInt(p.substring(1));
                    if (!Number.isInteger(pValue)) {
                        pValue = 0;
                        console.error(`Could not parse parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}); expected register`);
                    }
                    else if (p[0] !== 'r' || pValue < 0 || pValue >= 32) {
                        console.error(`Could not parse parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}); expected register`);
                    }
                    break;
                case 'number':
                    pValue = GeneralEncoder.parseNumber(p);
                    if (!Number.isInteger(pValue)) {
                        pValue = 0;
                        console.error(`Could not parse parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}); expected integer`);
                    }
                    break;
                case 'absolute':
                case 'relative':
                    pValue = parseInt(p);
                    if (!Number.isInteger(pValue)) {
                        pValue = 0;
                        useLabel = true;
                    }
                    break;
                default:
                    break;
            }
            paramValues.push(pValue);
            isLabel.push(useLabel);
            // do bounds check
            let min = 0;
            let max = 1 << t[1];
            if (t[2] === true) { // signed parameter
                max = max / 2;
                min = -max;
            }
            if (pValue < min || pValue >= max) {
                console.warn(`Parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}) out of range: expected [${min}..${max})`);
            }
        }
        // console.log(`${this.name} ${paramValues}`)
        this.paramUsages.forEach(usage => {
            if (isLabel[usage.paramIndex]) {
                labelUsages.push(new LabelUsage(params[usage.paramIndex], outputArray.length + usage.wordIndex, usage.shift, usage.mask, this.paramTypes[usage.paramIndex][0] === 'relative' ? index + 1 : 0));
            }
            else {
                if (usage.shift > 0) {
                    opcode[usage.wordIndex] |= (paramValues[usage.paramIndex] << usage.shift) & usage.mask;
                }
                else {
                    opcode[usage.wordIndex] |= (paramValues[usage.paramIndex] >> -usage.shift) & usage.mask;
                }
            }
        });
        outputArray.push(...opcode);
    }
}
// Encoder for operations where each parameter is an integer stored in contiguous bits
class SimpleParameterEncoder extends Encoder {
    constructor(name, baseOpcode, ...paramLocations) {
        super();
        this.name = name;
        this.baseOpcode = baseOpcode;
        this.paramLocations = paramLocations;
    }
    encode(params, _index, _labelUsages, outputArray, _constants) {
        if (params.length !== this.paramLocations.length) {
            console.error(`Could not encode ${this.name} ${params}: expected ${this.paramLocations.length} parameters, received ${params.length}`);
            return;
        }
        let output = this.baseOpcode;
        for (let i = 0; i < params.length; i++) {
            let pValue = Encoder.parseNumber(params[i]);
            if (pValue >= 2 ** this.paramLocations[i][1]) {
                console.error(`Could not encode {name} {params}: Parameter {i} too large`);
            }
            pValue <<= this.paramLocations[i][0];
            output |= pValue;
        }
        outputArray.push(output);
    }
}
class RPAEncoder extends Encoder {
    constructor(name, baseOpcode) {
        super();
        this.name = name;
        this.baseOpcode = baseOpcode;
    }
    encode(params, index, labelUsages, outputArray, _constants) {
        labelUsages.push(new LabelUsage(params[0], outputArray.length, 0, 0xfff, index + 1));
        outputArray.push(this.baseOpcode);
    }
}
// TODO: macros, usb (see email), think about testing and evaluation (is it useful) (github pages to host)
// VERSION CONTROL
// find people to test it
// automated testing
// const opcodes = {
//     sbis: new SimpleParameterEncoder("sbis", 0x9B00, [3, 5], [0, 3]),
//     sbi: new SimpleParameterEncoder("sbi", 0x9A00, [3, 5], [0, 3]),
//     rjmp: new RPAEncoder("rjmp", 0xC000),
//     cbi: new SimpleParameterEncoder("cbi", 0x9800, [3, 5], [0, 3]),
// };
const opcodes = {
    sbis: new GeneralEncoder("sbis", "Ab", "10011011AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbi: new GeneralEncoder("sbi", "Ab", "10011010AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    rjmp: new GeneralEncoder("rjmp", "k", "1100kkkkkkkkkkkk", ["relative", 12, true]),
    cbi: new GeneralEncoder("cbi", "Ab", "10011000AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    jmp: new GeneralEncoder("jmp", "k", "1001010kkkkk110kkkkkkkkkkkkkkkkk", ["absolute", 22, false]),
    lds: new GeneralEncoder("lds", "dk", "1001000ddddd0000kkkkkkkkkkkkkkkk", ["register", 5, false], ["number", 16, false]),
    ldi: new GeneralEncoder("ldi", "dK", "1110KKKKddddKKKK", ["register", 5, false], ["number", 8, false]),
};
const lineRegex = /^(?<label>[^;:%]+:)?\s*(?:(?<inst>[A-Za-z0-9]+)(?:\s+(?<param>[^;]*))?)?(?:;.*)?$|^\s*%define\s+(?<const>[^ ]+)\s+(?<value>[^ ]+)\s*(?:;.*)?$/;
/* Assemble a code block to contiguous memory, starting at offset
 * store found labels in labels
 */
function assembleBlock(lines, offset, labels, constants) {
    const binaryCode = []; // an array holding 16 bit words for the assembled code
    const labelUsages = [];
    lines.forEach(line => {
        var _a;
        const match = (_a = line.match(lineRegex)) === null || _a === void 0 ? void 0 : _a.groups;
        if (match !== undefined) {
            if (match.label) {
                const labelName = match.label.substring(0, match.label.length - 1).trim();
                labels[labelName] = binaryCode.length + offset;
            }
            if (match.inst) {
                const opcode = match.inst.toLowerCase();
                const params = (match.param || '').split(',').map(s => s.trim());
                if (opcode in opcodes) {
                    opcodes[opcode].encode(params, binaryCode.length + offset, labelUsages, binaryCode, constants);
                }
            }
            if (match.const) {
                constants[match.const] = constants[match.value] || match.value;
            }
        }
        else {
            console.error(`Syntax error: ${line}`);
        }
    });
    return [binaryCode, labelUsages];
}
function doSecondPass(binaryCode, labelUsages, labels) {
    labelUsages.forEach(lu => {
        binaryCode[lu.index] |= lu.evaluate(labels);
    });
    const ab = new ArrayBuffer(2 * binaryCode.length);
    const dv = new DataView(ab);
    for (let i = 0; i < binaryCode.length; i++) {
        dv.setUint16(2 * i, binaryCode[i], true);
    }
    return ab;
}
export default function assemble(code) {
    const labels = {};
    const constants = {};
    const lines = code.split('\n');
    const firstPass = assembleBlock(lines, 0, labels, constants);
    return doSecondPass(firstPass[0], firstPass[1], labels);
}
