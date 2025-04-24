const byteToHex: string[] = [];

for (let i = 0; i < 256; i++) {
    byteToHex.push(i.toString(16).padStart(2, '0').toUpperCase());
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer);
    let hexString = "";
    byteArray.forEach(b => {
        hexString = hexString + byteToHex[b];
    });
    return hexString;
}

function byteSum(data: ArrayBuffer): number {
    const bytes = new Uint8Array(data);
    let sum = 0;
    bytes.forEach(b => {
        sum += b;
    });
    return sum & 255;
}

export class HexWriter {
    lines: string[];
    currentPosition: number;
    validPosition: boolean;
    constructor() {
        this.lines = [];
        this.currentPosition = 0;
        this.validPosition = false;
    }
    gotoPosition(newPos: number): void {
        if (newPos >>> 16 != this.currentPosition >>> 16) { // moved to new 2^16 byte section
            this.validPosition = false;
        }
        this.currentPosition = newPos;
    }
    writeBytes(data: ArrayBuffer): void {
        for (let i = 0; i < data.byteLength; i += 16) { // limit line length
            this.writeBytesUnchecked(data.slice(i, i + 16));
        }
    }
    // Write provided bytes, requires 0 < data.byteLength < 256
    private writeBytesUnchecked(data: ArrayBuffer): void {
        if (!this.validPosition) {
            const posCheckSum = 255 & -(6 + (this.currentPosition >>> 24) + (this.currentPosition >>> 16)); 
            this.lines.push(":02000004" + 
                (this.currentPosition >>> 16).toString(16).padStart(4, '0').toUpperCase() + 
                byteToHex[posCheckSum]
            );
            this.validPosition = true;
        }
        let line = ":" + byteToHex[data.byteLength];
        line += (this.currentPosition & 0xffff).toString(16).padStart(4, '0').toUpperCase();
        line += "00"
        line += arrayBufferToHex(data);
        const lineSum = data.byteLength + (this.currentPosition >>> 8) + this.currentPosition + byteSum(data);
        const checkSum = 255 & -lineSum;
        line += byteToHex[checkSum];
        this.lines.push(line);
        const newPosition = this.currentPosition + data.byteLength;
        if (newPosition >>> 16 != this.currentPosition >>> 16) { // moved to new 2^16 byte section
            this.validPosition = false;
        }
        this.currentPosition = newPosition;
    }
    close(): string {
        this.lines.push(":00000001FF");
        return this.lines.join("\n") + '\n';
    }
    createObjectURL(): string {
        const contents = this.close();
        const blob = new Blob([contents], {
            type: "text/plain",
        });
        return URL.createObjectURL(blob);
    }
}