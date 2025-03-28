// Finish instructions, test, eval (structured) (no better options)
// Merge erase and load
// disable load button with nothing connected, give error and suggestion
/*
Report:
Intro is more summary say what you did and why
Background - what is avr, webusb, dfu
Core chapters: title like browser based assembler implementation
Testing and evaluation chapter(s) - no bugs, is it useful?
Conclusions - summarise again, reflections (use I here), future work (new project's worth) (e.g. reference, emulator or compiler)
*/
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
                    else if (typeof t[1] === 'object') {
                        if (!t[1].has(pValue)) {
                            console.error(`Could not parse parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}); register out of bounds`);
                        }
                        else if (t[1] instanceof Map) {
                            pValue = t[1].get(pValue);
                        }
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
                    pValue = 0;
                    if (p.toUpperCase() !== t[0]) {
                        console.error(`Error parsing parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}); expected ${t[0]}`);
                    }
                    break;
            }
            paramValues.push(pValue);
            isLabel.push(useLabel);
            // do bounds check
            if (typeof t[1] === 'number') {
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
class ImmediateEncoder extends Encoder {
    encode(params, _index, _labelUsages, outputArray, constants) {
        if (params.length !== 2) {
            console.error(`Could not encode ${this.name} ${params.join(", ")}: expected 2 parameters, received ${params.length}`);
            return;
        }
        const registerStr = constants[params[0]] || params[0];
        let register = parseInt(registerStr.substring(1));
        if (!Number.isInteger(register)) {
            register = 16;
            console.error(`Could not parse parameter 0 of ${this.name} ${params.join(', ')} (${params[0]}); expected r16-r31`);
        }
        else if (registerStr[0] !== 'r' || register < 16 || register >= 32) {
            console.error(`Could not parse parameter 0 of ${this.name} ${params.join(', ')} (${params[0]}); expected r16-r31`);
        }
        const valueStr = constants[params[0]] || params[0];
        let value = GeneralEncoder.parseNumber(valueStr);
        if (!Number.isInteger(value)) {
            value = 0;
            console.error(`Could not parse parameter 1 of ${this.name} ${params.join(', ')} (${params[1]}); expected integer`);
        }
        if (value < 0 || value >= 256) {
            console.warn(`Parameter 1 of ${this.name} ${params.join(', ')} (${params[1]}) out of range: expected [0..256)`);
        }
        outputArray.push((this.prefix << 12) | ((value & 0xf0) << 8) | ((register & 0xf) << 4) | (value & 0xf));
    }
    constructor(name, prefix) {
        super();
        this.name = name;
        this.prefix = prefix;
    }
}
// TODO: macros, usb (see email), think about testing and evaluation (is it useful) (github pages to host)
// VERSION CONTROL
// find people to test it
// automated testing
/* Skipped instructions:
 * adiw
 * cbr
 * elpm
 * ld (X,Y,Z)
 * lpm
 * movw
 * sbiw
 * spm
 * st
 * sts
*/
const r_16_23 = new Set([16, 17, 18, 19, 20, 21, 22, 23]);
const r_16_31 = new Set([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
const clrEncoder = new GeneralEncoder("clr", "d", "001001ddddd00000", ["register", 5, false]);
clrEncoder.paramUsages.push(new ParamUsage(0, 0, 0, 0x1f));
const lslEncoder = new GeneralEncoder("lsl", "d", "000011ddddd00000", ["register", 5, false]);
lslEncoder.paramUsages.push(new ParamUsage(0, 0, 0, 0x1f));
const rolEncoder = new GeneralEncoder("rol", "d", "000111ddddd00000", ["register", 5, false]);
rolEncoder.paramUsages.push(new ParamUsage(0, 0, 0, 0x1f));
const tstEncoder = new GeneralEncoder("tst", "d", "001000ddddd00000", ["register", 5, false]);
tstEncoder.paramUsages.push(new ParamUsage(0, 0, 0, 0x1f));
const encoders = {
    adc: new GeneralEncoder("adc", "dr", "000111rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    add: new GeneralEncoder("add", "dr", "000011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    and: new GeneralEncoder("and", "dr", "001011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    andi: new ImmediateEncoder("andi", 0b0111),
    asr: new GeneralEncoder("asr", "d", "1001010ddddd0101", ["register", 5, false]),
    bclr: new GeneralEncoder("bclr", "s", "100101001sss1000", ["number", 3, false]),
    bld: new GeneralEncoder("bld", "db", "1111100ddddd0bbb", ["register", 5, false], ["number", 3, false]),
    brbc: new GeneralEncoder("brbc", "sk", "111101kkkkkkksss", ["number", 3, false], ["relative", 7, true]),
    brbs: new GeneralEncoder("brbs", "sk", "111100kkkkkkksss", ["number", 3, false], ["relative", 7, true]),
    brcc: new GeneralEncoder("brcc", "k", "111101kkkkkkk000", ["relative", 7, true]),
    brcs: new GeneralEncoder("brcs", "k", "111100kkkkkkk000", ["relative", 7, true]),
    break: new GeneralEncoder("break", "", "1001010110011000"),
    breq: new GeneralEncoder("breq", "k", "111100kkkkkkk001", ["relative", 7, true]),
    brge: new GeneralEncoder("brge", "k", "111101kkkkkkk100", ["relative", 7, true]),
    brhc: new GeneralEncoder("brhc", "k", "111101kkkkkkk101", ["relative", 7, true]),
    brhs: new GeneralEncoder("brhs", "k", "111100kkkkkkk101", ["relative", 7, true]),
    brid: new GeneralEncoder("brid", "k", "111101kkkkkkk111", ["relative", 7, true]),
    brie: new GeneralEncoder("brie", "k", "111100kkkkkkk111", ["relative", 7, true]),
    brlo: new GeneralEncoder("brlo", "k", "111100kkkkkkk000", ["relative", 7, true]),
    brlt: new GeneralEncoder("brlt", "k", "111100kkkkkkk100", ["relative", 7, true]),
    brmi: new GeneralEncoder("brmi", "k", "111100kkkkkkk010", ["relative", 7, true]),
    brpl: new GeneralEncoder("brpl", "k", "111101kkkkkkk010", ["relative", 7, true]),
    brsh: new GeneralEncoder("brsh", "k", "111101kkkkkkk000", ["relative", 7, true]),
    brtc: new GeneralEncoder("brtc", "k", "111101kkkkkkk110", ["relative", 7, true]),
    brts: new GeneralEncoder("brts", "k", "111100kkkkkkk110", ["relative", 7, true]),
    brvc: new GeneralEncoder("brvc", "k", "111101kkkkkkk011", ["relative", 7, true]),
    brvs: new GeneralEncoder("brvs", "k", "111100kkkkkkk011", ["relative", 7, true]),
    brne: new GeneralEncoder("brne", "k", "111101kkkkkkk001", ["relative", 7, true]),
    bset: new GeneralEncoder("bset", "s", "100101000sss1000", ["number", 3, false]),
    bst: new GeneralEncoder("bst", "db", "1111101ddddd0bbb", ["register", 5, false], ["number", 3, false]),
    call: new GeneralEncoder("call", "k", "1001010kkkkk111kkkkkkkkkkkkkkkkk", ["absolute", 22, false]),
    cbi: new GeneralEncoder("cbi", "Ab", "10011000AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    clc: new GeneralEncoder("clc", "", "1001010010001000"),
    clh: new GeneralEncoder("clh", "", "1001010011011000"),
    cli: new GeneralEncoder("cli", "", "1001010011111000"),
    cln: new GeneralEncoder("cln", "", "1001010010101000"),
    clr: clrEncoder,
    cls: new GeneralEncoder("cls", "", "1001010011001000"),
    clt: new GeneralEncoder("clt", "", "1001010011101000"),
    clv: new GeneralEncoder("clv", "", "1001010010111000"),
    clz: new GeneralEncoder("clz", "", "1001010010011000"),
    com: new GeneralEncoder("com", "d", "1001010ddddd0000", ["register", 5, false]),
    cp: new GeneralEncoder("cp", "dr", "000101rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    cpc: new GeneralEncoder("cpc", "dr", "000001rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    cpi: new ImmediateEncoder("cpi", 0b0011),
    cpse: new GeneralEncoder("cpse", "dr", "000100rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    dec: new GeneralEncoder("dec", "d", "1001010ddddd1010", ["register", 5, false]),
    des: new GeneralEncoder("des", "K", "10010100KKKK1011", ["number", 4, false]),
    eicall: new GeneralEncoder("eicall", "", "1001010100011001"),
    eijmp: new GeneralEncoder("eijmp", "", "1001010000011001"),
    eor: new GeneralEncoder("eor", "dr", "001001rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    fmul: new GeneralEncoder("fmul", "dr", "000000110ddd1rrr", ["register", r_16_23], ["register", r_16_23]),
    fmuls: new GeneralEncoder("fmuls", "dr", "000000111ddd0rrr", ["register", r_16_23], ["register", r_16_23]),
    fmulsu: new GeneralEncoder("fmulsu", "dr", "000000111ddd1rrr", ["register", r_16_23], ["register", r_16_23]),
    icall: new GeneralEncoder("icall", "", "1001010100001001"),
    ijmp: new GeneralEncoder("ijmp", "", "1001010000001001"),
    in: new GeneralEncoder("in", "dA", "10110AAdddddAAAA", ["register", 5, false], ["number", 6, false]),
    inc: new GeneralEncoder("inc", "d", "1001010ddddd0011", ["register", 5, false]),
    jmp: new GeneralEncoder("jmp", "k", "1001010kkkkk110kkkkkkkkkkkkkkkkk", ["absolute", 22, false]),
    lac: new GeneralEncoder("lac", "Zr", "1001001rrrrr0110", ["Z", 0, false], ["register", 5, false]),
    las: new GeneralEncoder("las", "Zr", "1001001rrrrr0101", ["Z", 0, false], ["register", 5, false]),
    lat: new GeneralEncoder("lat", "Zr", "1001001rrrrr0111", ["Z", 0, false], ["register", 5, false]),
    ldi: new ImmediateEncoder("ldi", 0b1110),
    lds: new GeneralEncoder("lds", "dk", "1001000ddddd0000kkkkkkkkkkkkkkkk", ["register", 5, false], ["number", 16, false]), // FIXME: aliased
    lsl: lslEncoder,
    lsr: new GeneralEncoder("lsr", "d", "1001010ddddd0110", ["register", 5, false]),
    mov: new GeneralEncoder("mov", "dr", "001011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    mul: new GeneralEncoder("mul", "dr", "000111rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    muls: new GeneralEncoder("muls", "dr", "00000010ddddrrrr", ["register", r_16_31], ["register", r_16_31]),
    mulsu: new GeneralEncoder("mulsu", "dr", "000000110ddd0rrr", ["register", r_16_23], ["register", r_16_23]),
    neg: new GeneralEncoder("neg", "d", "1001010ddddd0001", ["register", 5, false]),
    nop: new GeneralEncoder("nop", "", "0000000000000000"),
    or: new GeneralEncoder("or", "dr", "001010rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    ori: new ImmediateEncoder("ori", 0b0110),
    out: new GeneralEncoder("out", "dA", "10111AAdddddAAAA", ["register", 5, false], ["number", 6, false]),
    pop: new GeneralEncoder("pop", "d", "1001000ddddd1111", ["register", 5, false]),
    push: new GeneralEncoder("push", "d", "1001001ddddd1111", ["register", 5, false]),
    rcall: new GeneralEncoder("rcall", "k", "1101kkkkkkkkkkkk", ["relative", 12, true]),
    ret: new GeneralEncoder("ret", "", "1001010100001000"),
    reti: new GeneralEncoder("reti", "", "1001010100011000"),
    rjmp: new GeneralEncoder("rjmp", "k", "1100kkkkkkkkkkkk", ["relative", 12, true]),
    rol: rolEncoder,
    ror: new GeneralEncoder("ror", "d", "1001010ddddd0111", ["register", 5, false]),
    sbc: new GeneralEncoder("sbc", "dr", "000010rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    sbci: new ImmediateEncoder("sbci", 0b0100),
    sbi: new GeneralEncoder("sbi", "Ab", "10011010AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbic: new GeneralEncoder("sbic", "Ab", "10011001AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbis: new GeneralEncoder("sbis", "Ab", "10011011AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbr: new ImmediateEncoder("sbr", 0b0110),
    sbrc: new GeneralEncoder("sbrc", "rb", "1111110rrrrr0bbb", ["register", 5, false], ["number", 3, false]),
    sbrs: new GeneralEncoder("sbrs", "rb", "1111111rrrrr0bbb", ["register", 5, false], ["number", 3, false]),
    sec: new GeneralEncoder("sec", "", "1001010000001000"),
    seh: new GeneralEncoder("seh", "", "1001010001011000"),
    sei: new GeneralEncoder("sei", "", "1001010001111000"),
    sen: new GeneralEncoder("sen", "", "1001010000101000"),
    ser: new GeneralEncoder("ser", "d", "11101111dddd1111", ["register", r_16_31]),
    ses: new GeneralEncoder("ses", "", "1001010001001000"),
    set: new GeneralEncoder("set", "", "1001010001101000"),
    sev: new GeneralEncoder("sev", "", "1001010000111000"),
    sez: new GeneralEncoder("sez", "", "1001010000011000"),
    sleep: new GeneralEncoder("sleep", "", "1001010110001000"),
    sub: new GeneralEncoder("sub", "dr", "000110rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    subi: new ImmediateEncoder("subi", 0b0101),
    swap: new GeneralEncoder("swap", "d", "1001010ddddd0010", ["register", 5, false]),
    tst: tstEncoder,
    wdr: new GeneralEncoder("wdr", "", "1001010110101000"),
    xch: new GeneralEncoder("xch", "Zr", "1001001rrrrr0100", ["Z", 0, false], ["regiser", 5, false]),
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
                const instName = match.inst.toLowerCase();
                const params = (match.param || '').split(',').map(s => s.trim());
                if (instName in encoders) {
                    encoders[instName].encode(params, binaryCode.length + offset, labelUsages, binaryCode, constants);
                }
                else {
                    console.error(`${instName} is not a valid instruction name`);
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
