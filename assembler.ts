interface Dictionary<T> {
    [key: string]: T;
}

class ParamUsage {
    paramIndex: number;
    wordIndex: number;
    shift: number;
    mask: number;
    constructor (paramIndex: number, wordIndex: number, shift: number, mask: number) {
        this.paramIndex = paramIndex;
        this.wordIndex = wordIndex;
        this.shift = shift;
        this.mask = mask;
    }
    static generateUsages(params: string, opcode: string): [ParamUsage[], number[]] {
        const usages: ParamUsage[] = [];
        let currentChar = '';
        const shifts: number[] = Array(params.length).fill(0);
        let curPos = 0;
        let startPos = 0;
        const numWords = opcode.length / 16;
        const baseWords: number[] = Array(numWords).fill(0);
        while (curPos < opcode.length) {
            const c = opcode.charAt(opcode.length - 1 - curPos);
            if (c !== currentChar || curPos % 16 === 0) {
                if (currentChar !== '') {
                    const parIndex = params.indexOf(currentChar);
                    let lIndex = curPos % 16;
                    if (lIndex === 0) lIndex = 16;
                    const rIndex = startPos % 16;
                    const shift = rIndex - shifts[parIndex];
                    const mask = (1 << lIndex) - (1 << rIndex);
                    const wordIndex = numWords - 1 - Math.floor(startPos / 16);
                    usages.push(new ParamUsage(parIndex, wordIndex, shift, mask))
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
            if (lIndex === 0) lIndex = 16;
            const rIndex = startPos % 16;
            const shift = rIndex - shifts[parIndex];
            const mask = (1 << lIndex) - (1 << rIndex);
            const wordIndex = numWords - 1 - Math.floor(startPos / 16);
            usages.push(new ParamUsage(parIndex, wordIndex, shift, mask))
            shifts[parIndex] += lIndex - rIndex;
        }
        // console.log(usages)
        // console.log(baseWords)
        return [usages, baseWords];
    }
}

class LabelUsage {
    label: string;
    offset: number;
    index: number;
    shift: number;
    mask: number; // instruction to do output[index] |= (labels[label] << shift) & mask
    constructor(label: string, index: number, shift: number, mask: number, offset: number) {
        this.label = label;
        this.index = index;
        this.shift = shift;
        this.mask = mask;
        this.offset = offset;
    }
    evaluate(labels: Dictionary<number>) { // calculate what to or with target
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
abstract class Encoder {
    abstract encode(params: string[], index: number, labelUsages: LabelUsage[], outputArray: number[], constants: Dictionary<string>): void;
    static parseNumber(x: string): number {
        if (x[0] == '$') {
            return parseInt(x.substring(1))
        }
        else {
            return parseInt(x)
        }
    }
}

class GeneralEncoder extends Encoder {
    name: string;
    baseWords: number[];
    paramUsages: ParamUsage[];
    paramTypes: [string, number, boolean][]
    constructor(name: string, params: string, opcode: string, ...paramTypes: [string, number, boolean][]) {
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
    encode(params: string[], index: number, labelUsages: LabelUsage[], outputArray: number[], constants: Dictionary<string>): void {
        const opcode = this.baseWords.slice();
        if (params.length !== this.paramTypes.length) {
            console.error(`Could not encode ${this.name} ${params.join(', ')}: expected ${this.paramTypes.length} parameters, received ${params.length}`);
            return;
        }
        const paramValues: number[] = [];
        const isLabel: boolean[] = [];
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
                console.warn(`Parameter ${i} of ${this.name} ${params.join(', ')} (${params[i]}) out of range: expected [${min}..${max})`)
            }
        }
        // console.log(`${this.name} ${paramValues}`)
        this.paramUsages.forEach(usage => {
            if (isLabel[usage.paramIndex]) {
                labelUsages.push(new LabelUsage(
                    params[usage.paramIndex], outputArray.length + usage.wordIndex, 
                    usage.shift, usage.mask, 
                    this.paramTypes[usage.paramIndex][0] === 'relative' ? index + 1 : 0));
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
    name: string;
    baseOpcode: number;
    paramLocations: number[][];
    constructor(name: string, baseOpcode: number, ...paramLocations: number[][]) {
        super();
        this.name = name;
        this.baseOpcode = baseOpcode;
        this.paramLocations = paramLocations;
    }
    encode(params: string[], _index: number, _labelUsages: LabelUsage[], outputArray: number[], _constants: Dictionary<string>): void {
        if (params.length !== this.paramLocations.length) {
            console.error(`Could not encode ${this.name} ${params}: expected ${this.paramLocations.length} parameters, received ${params.length}`);
            return;
        }
        let output = this.baseOpcode;
        for (let i = 0; i < params.length; i++) {
            let pValue = Encoder.parseNumber(params[i]);
            if (pValue >= 2**this.paramLocations[i][1]) {
                console.error(`Could not encode {name} {params}: Parameter {i} too large`);
            }
            pValue <<= this.paramLocations[i][0];
            output |= pValue;
        }
        outputArray.push(output);
    }
}

class RPAEncoder extends Encoder {
    name: string;
    baseOpcode: number;
    paramLocations: number[][];
    constructor(name: string, baseOpcode: number) {
        super();
        this.name = name;
        this.baseOpcode = baseOpcode;
    }
    encode(params: string[], index: number, labelUsages: LabelUsage[], outputArray: number[], _constants: Dictionary<string>): void {
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

/* Skipped instructions:
 * adiw
 * andi
 * cbr
 * clr
 * cpi
 * elpm
 * fmul
 * fmuls
 * fmulsu
 * lac
 * las
 * lat
 * ld (X,Y,Z)
 * lpm
 * lsl
 * movw
 * muls
 * mulsu
 * ori
 * rol
 * sbci
 * sbiw
 * sbr
 * ser
 * spm
 * st
 * sts
 * subi
 * tst
 * xch
*/

const opcodes = {
    adc: new GeneralEncoder("adc", "dr",   "000111rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    add: new GeneralEncoder("add", "dr",   "000011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    and: new GeneralEncoder("and", "dr",   "001011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    asr: new GeneralEncoder("asr", "d",    "1001010ddddd0101", ["register", 5, false]),
    bclr: new GeneralEncoder("bclr", "s",  "100101001sss1000", ["number", 3, false]),
    bld: new GeneralEncoder("bld", "db",   "1111100ddddd0bbb", ["register", 5, false], ["number", 3, false]),
    brbc: new GeneralEncoder("brbc", "sk", "111101kkkkkkksss", ["number", 3, false], ["relative", 7, true]),
    brbs: new GeneralEncoder("brbs", "sk", "111100kkkkkkksss", ["number", 3, false], ["relative", 7, true]),
    brcc: new GeneralEncoder("brcc", "k",  "111101kkkkkkk000", ["relative", 7, true]),
    brcs: new GeneralEncoder("brcs", "k",  "111100kkkkkkk000", ["relative", 7, true]),
    break: new GeneralEncoder("break", "", "1001010110011000"),
    breq: new GeneralEncoder("breq", "k",  "111100kkkkkkk001", ["relative", 7, true]),
    brge: new GeneralEncoder("brge", "k",  "111101kkkkkkk100", ["relative", 7, true]),
    brhc: new GeneralEncoder("brhc", "k",  "111101kkkkkkk101", ["relative", 7, true]),
    brhs: new GeneralEncoder("brhs", "k",  "111100kkkkkkk101", ["relative", 7, true]),
    brid: new GeneralEncoder("brid", "k",  "111101kkkkkkk111", ["relative", 7, true]),
    brie: new GeneralEncoder("brie", "k",  "111100kkkkkkk111", ["relative", 7, true]),
    brlo: new GeneralEncoder("brlo", "k",  "111100kkkkkkk000", ["relative", 7, true]),
    brlt: new GeneralEncoder("brlt", "k",  "111100kkkkkkk100", ["relative", 7, true]),
    brmi: new GeneralEncoder("brmi", "k",  "111100kkkkkkk010", ["relative", 7, true]),
    brpl: new GeneralEncoder("brpl", "k",  "111101kkkkkkk010", ["relative", 7, true]),
    brsh: new GeneralEncoder("brsh", "k",  "111101kkkkkkk000", ["relative", 7, true]),
    brtc: new GeneralEncoder("brtc", "k",  "111101kkkkkkk110", ["relative", 7, true]),
    brts: new GeneralEncoder("brts", "k",  "111100kkkkkkk110", ["relative", 7, true]),
    brvc: new GeneralEncoder("brvc", "k",  "111101kkkkkkk011", ["relative", 7, true]),
    brvs: new GeneralEncoder("brvs", "k",  "111100kkkkkkk011", ["relative", 7, true]),
    brne: new GeneralEncoder("brne", "k",  "111101kkkkkkk001", ["relative", 7, true]),
    bset: new GeneralEncoder("bset", "s",  "100101000sss1000", ["number", 3, false]),
    bst: new GeneralEncoder("bst", "db",   "1111101ddddd0bbb", ["register", 5, false], ["number", 3, false]),
    call: new GeneralEncoder("call", "k",  "1001010kkkkk111kkkkkkkkkkkkkkkkk", ["absolute", 22, false]),
    cbi: new GeneralEncoder("cbi", "Ab",   "10011000AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    clc: new GeneralEncoder("clc", "",     "1001010010001000"),
    clh: new GeneralEncoder("clh", "",     "1001010011011000"),
    cli: new GeneralEncoder("cli", "",     "1001010011111000"),
    cln: new GeneralEncoder("cln", "",     "1001010010101000"),
    cls: new GeneralEncoder("cls", "",     "1001010011001000"),
    clt: new GeneralEncoder("clt", "",     "1001010011101000"),
    clv: new GeneralEncoder("clv", "",     "1001010010111000"),
    clz: new GeneralEncoder("clz", "",     "1001010010011000"),
    com: new GeneralEncoder("com", "d",    "1001010ddddd0000", ["register", 5, false]),
    cp: new GeneralEncoder("cp", "dr",     "000101rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    cpc: new GeneralEncoder("cpc", "dr",   "000001rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    cpse: new GeneralEncoder("cpse", "dr", "000100rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    dec: new GeneralEncoder("dec", "d",    "1001010ddddd1010", ["register", 5, false]),
    des: new GeneralEncoder("des", "K",    "10010100KKKK1011", ["number", 4, false]),
    eicall: new GeneralEncoder("eicall","","1001010100011001"),
    eijmp: new GeneralEncoder("eijmp", "", "1001010000011001"),
    eor: new GeneralEncoder("eor", "dr",   "001001rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    icall: new GeneralEncoder("icall", "", "1001010100001001"),
    ijmp: new GeneralEncoder("ijmp", "",   "1001010000001001"),
    in: new GeneralEncoder("in", "dA",     "10110AAdddddAAAA", ["register", 5, false], ["number", 6, false]),
    inc: new GeneralEncoder("inc", "d",    "1001010ddddd0011", ["register", 5, false]),
    jmp: new GeneralEncoder("jmp", "k",    "1001010kkkkk110kkkkkkkkkkkkkkkkk", ["absolute", 22, false]),
    ldi: new GeneralEncoder("ldi", "dK",   "1110KKKKddddKKKK", ["register", 5, false], ["number", 8, false]), // FIXME: check register bounds
    lds: new GeneralEncoder("lds", "dk",   "1001000ddddd0000kkkkkkkkkkkkkkkk", ["register", 5, false], ["number", 16, false]), // FIXME: aliased
    lsr: new GeneralEncoder("lsr", "d",    "1001010ddddd0110", ["register", 5, false]),
    mov: new GeneralEncoder("mov", "dr",   "001011rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    mul: new GeneralEncoder("mul", "dr",   "000111rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    neg: new GeneralEncoder("neg", "d",    "1001010ddddd0001", ["register", 5, false]),
    nop: new GeneralEncoder("nop", "",     "0000000000000000"),
    or: new GeneralEncoder("or", "dr",     "001010rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    out: new GeneralEncoder("out", "dA",   "10111AAdddddAAAA", ["register", 5, false], ["number", 6, false]),
    pop: new GeneralEncoder("pop", "d",    "1001000ddddd1111", ["register", 5, false]),
    push: new GeneralEncoder("push", "d",  "1001001ddddd1111", ["register", 5, false]),
    rcall: new GeneralEncoder("rcall", "k","1101kkkkkkkkkkkk", ["relative", 12, true]),
    ret: new GeneralEncoder("ret", "",     "1001010100001000"),
    reti: new GeneralEncoder("reti", "",   "1001010100011000"),
    rjmp: new GeneralEncoder("rjmp", "k",  "1100kkkkkkkkkkkk", ["relative", 12, true]),
    ror: new GeneralEncoder("ror", "d",    "1001010ddddd0111", ["register", 5, false]),
    sbc: new GeneralEncoder("sbc", "dr",   "000010rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    sbi: new GeneralEncoder("sbi", "Ab",   "10011010AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbic: new GeneralEncoder("sbic", "Ab", "10011001AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbis: new GeneralEncoder("sbis", "Ab", "10011011AAAAAbbb", ["number", 5, false], ["number", 3, false]),
    sbrc: new GeneralEncoder("sbrc", "rb", "1111110rrrrr0bbb", ["register", 5, false], ["number", 3, false]),
    sbrs: new GeneralEncoder("sbrs", "rb", "1111111rrrrr0bbb", ["register", 5, false], ["number", 3, false]),
    sec: new GeneralEncoder("sec", "",     "1001010000001000"),
    seh: new GeneralEncoder("seh", "",     "1001010001011000"),
    sei: new GeneralEncoder("sei", "",     "1001010001111000"),
    sen: new GeneralEncoder("sen", "",     "1001010000101000"),
    ser: new GeneralEncoder("ser", "",     "1001010001001000"),
    set: new GeneralEncoder("set", "",     "1001010001101000"),
    sev: new GeneralEncoder("sev", "",     "1001010000111000"),
    sez: new GeneralEncoder("sez", "",     "1001010000011000"),
    sleep: new GeneralEncoder("sleep", "", "1001010110001000"),
    sub: new GeneralEncoder("sub", "dr",   "000110rdddddrrrr", ["register", 5, false], ["register", 5, false]),
    swap: new GeneralEncoder("swap", "d",  "1001010ddddd0010", ["register", 5, false]),
    wdr: new GeneralEncoder("wdr", "",     "1001010110101000"),
};

const lineRegex = /^(?<label>[^;:%]+:)?\s*(?:(?<inst>[A-Za-z0-9]+)(?:\s+(?<param>[^;]*))?)?(?:;.*)?$|^\s*%define\s+(?<const>[^ ]+)\s+(?<value>[^ ]+)\s*(?:;.*)?$/;

/* Assemble a code block to contiguous memory, starting at offset
 * store found labels in labels
 */
function assembleBlock(lines: string[], offset: number, labels: Dictionary<number>, constants: Dictionary<string>): [number[], LabelUsage[]] {
    const binaryCode = []; // an array holding 16 bit words for the assembled code
    const labelUsages = [];
    lines.forEach(line => {
        const match = line.match(lineRegex)?.groups;
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

function doSecondPass(binaryCode: number[], labelUsages: LabelUsage[], labels: Dictionary<number>): ArrayBuffer {
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

export default function assemble(code: string): ArrayBuffer {
    const labels: Dictionary<number> = {};
    const constants: Dictionary<string> = {};
    const lines = code.split('\n');
    const firstPass = assembleBlock(lines, 0, labels, constants);
    return doSecondPass(firstPass[0], firstPass[1], labels);
}
