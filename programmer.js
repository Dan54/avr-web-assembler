const DFU_DETACH = 0x00;
const DFU_DNLOAD = 0x01;
const DFU_UPLOAD = 0x02;
const DFU_GETSTATUS = 0x03;
const DFU_CLRSTATUS = 0x04;
const DFU_GETSTATE = 0x05;
const DFU_ABORT = 0x06;


const STATUS_OKAY = 0x00;
const STATUS_ERROR_TARGET = 0x01;
const STATUS_ERROR_FILE = 0x02;
const STATUS_ERROR_WRITE = 0x03;
const STATUS_ERROR_ERASE = 0x04;
const STATUS_ERROR_CHECK_ERASED = 0x05;
const STATUS_ERROR_PROG = 0x06;
const STATUS_ERROR_VERIFY = 0x07;
const STATUS_ERROR_ADDRESS = 0x08;
const STATUS_ERROR_NOTDONE = 0x09;
const STATUS_ERROR_FIRMWARE = 0x0A;
const STATUS_ERROR_VENDOR = 0x0B;
const STATUS_ERROR_USBR = 0x0C;
const STATUS_ERROR_POR = 0x0D;
const STATUS_ERROR_UNKNOWN = 0x0E;
const STATUS_ERROR_STALLEDPK = 0x0F;


const BLINK = [
    0x0C, 0x94, 0x3A, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x46, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00, 0x0C, 0x94, 0x44, 0x00,
    0x0C, 0x94, 0x44, 0x00, 0x11, 0x24, 0x1F, 0xBE, 0xCF, 0xEF, 0xD2, 0xE0, 0xDE, 0xBF, 0xCD, 0xBF,
    0x0E, 0x94, 0x58, 0x00, 0x0C, 0x94, 0x63, 0x00, 0x0C, 0x94, 0x00, 0x00, 0x1F, 0x92, 0x0F, 0x92,
    0x0F, 0xB6, 0x0F, 0x92, 0x11, 0x24, 0x8F, 0x93, 0x9F, 0x93, 0x9B, 0xB1, 0x80, 0xE1, 0x89, 0x27,
    0x8B, 0xB9, 0x9F, 0x91, 0x8F, 0x91, 0x0F, 0x90, 0x0F, 0xBE, 0x0F, 0x90, 0x1F, 0x90, 0x18, 0x95,
    0x54, 0x9A, 0x80, 0x91, 0x6E, 0x00, 0x81, 0x60, 0x80, 0x93, 0x6E, 0x00, 0x85, 0xB5, 0x84, 0x60,
    0x85, 0xBD, 0x78, 0x94, 0xFF, 0xCF, 0xF8, 0x94, 0xFF, 0xCF
];


const LED = [
    0x54, 0x9A, 0x4F, 0x9B, 0x02, 0xC0, 0x5C, 0x98, 0xFC, 0xCF, 0x5C, 0x9A, 0xFA, 0xCF
];


let device = null;


async function openDevice() {


    try {


        await device.open();
        
        await device.selectConfiguration(1);


        await device.claimInterface(0);


    } catch (e) {


        console.log("Problem opening USB device.")


        console.log(e);


    }


}


export async function connectToDevice() {


    const devices = await navigator.usb.getDevices();

    if (devices.length === 0) {
        device = await navigator.usb.requestDevice({ filters : [{ vendorId: 1003 }] });
    }
    else {
        device = devices[0];
    }


    if (device && !device.opened) {


        openDevice();


    }


}


async function sendToDevice(request, data) {


    const setup = {
        requestType: 'class',
        recipient: 'interface',
        request: request,
        value: 0,
        index: 0
    };


    const result = await device.controlTransferOut(setup, new Uint8Array(data));


    return result;


}


async function readFromDevice(request) {


    const setup = {
        requestType: 'class',
        recipient: 'interface',
        request: request,
        value: 0,
        index: 0
    };


    const result = await device.controlTransferIn(setup, 32);


    return result;


}


async function getStatus() {


    const result = await readFromDevice(DFU_GETSTATUS);


    if (result && result.data && result.data.buffer && result.data.buffer.byteLength === 6) {


        const data = new Uint8Array(result.data.buffer);


        return data[0];


    }


    return null;


}


export async function clearDevice() {


    const result = await sendToDevice(DFU_CLRSTATUS, []);


    if (result && result.status === 'ok') return true;


    return false;


}


export async function abortDevice() {


    const result = await sendToDevice(DFU_ABORT, []);


    if (result && result.status === 'ok') return true;


    return false;


}


export async function restartDevice() {


    let result = await sendToDevice(DFU_DNLOAD, [0x04, 0x03, 0x01, 0x00, 0x00, 0x00]);


    if (result && result.status === 'ok') {


        result = await sendToDevice(DFU_DNLOAD, []);


        if (result && result.status === 'ok') return true;


    }


    return false;


}


export async function eraseDevice() {


    const result = await sendToDevice(DFU_DNLOAD, [0x04, 0x00, 0xFF, 0x00, 0x00, 0x00]);


    if (result && result.status == 'ok') {


        const status = await getStatus();


        if (typeof(status) === 'number' && status === STATUS_OKAY) return true;


    }


    return false;


}


async function selectPage() {


    const result = await sendToDevice(DFU_DNLOAD, [0x06, 0x03, 0x00, 0x00]);


    if (result && result.status == 'ok') {


        const status = await getStatus();


        if (typeof(status) === 'number' && status === STATUS_OKAY) return true;


    }


    return false;


}


export async function programDevice(program) {


    const CONTROL_SIZE = 32;
    const PACKET_SIZE = 64;
    const FOOTER_SIZE = 16;


    const buffer = new Uint8Array(CONTROL_SIZE + PACKET_SIZE + FOOTER_SIZE);


    /* Check status and set page */


    const status = await getStatus();


    if (typeof(status) !== 'number' || status !== STATUS_OKAY) return true;


    const success = await selectPage();


    if (success === false) return false;


    /* Main loop */


    let start = 0;
    
    while (start < program.length) {


        const end = start + PACKET_SIZE - 1;


        const lastByte = Math.min(end, program.length - 1);


        console.log("Sending bytes " + start + " to " + lastByte);


        /* Set the header */


        buffer[0] = 0x01;
        buffer[1] = 0x00;
        buffer[2] = 0xFF & (start >> 8);
        buffer[3] = 0xFF & start;
        buffer[4] = 0xFF & (end >> 8);
        buffer[5] = 0xFF & end;


        for (let i = 6; i < CONTROL_SIZE; i += 1) buffer[i] = 0x00;


        /* Copy the data */


        const numberOfProgramBytes = Math.min(PACKET_SIZE, program.length - start);


        for (let i = 0; i < numberOfProgramBytes; i += 1) buffer[CONTROL_SIZE + i] = program[start + i];


        for (let i = numberOfProgramBytes; i < PACKET_SIZE; i += 1) buffer[CONTROL_SIZE + i] = 0xFF;


        /* Set the footer */


        buffer[CONTROL_SIZE + PACKET_SIZE + 0] = 0x00;
        buffer[CONTROL_SIZE + PACKET_SIZE + 1] = 0x00;
        buffer[CONTROL_SIZE + PACKET_SIZE + 2] = 0x00;
        buffer[CONTROL_SIZE + PACKET_SIZE + 3] = 0x00;


        buffer[CONTROL_SIZE + PACKET_SIZE + 4] = 0x10;


        buffer[CONTROL_SIZE + PACKET_SIZE + 5] = 0x44;
        buffer[CONTROL_SIZE + PACKET_SIZE + 6] = 0x46;
        buffer[CONTROL_SIZE + PACKET_SIZE + 7] = 0x55;


        buffer[CONTROL_SIZE + PACKET_SIZE + 8] = 0x01;
        buffer[CONTROL_SIZE + PACKET_SIZE + 9] = 0x10;


        buffer[CONTROL_SIZE + PACKET_SIZE + 10] = 0xFF;
        buffer[CONTROL_SIZE + PACKET_SIZE + 11] = 0xFF;


        buffer[CONTROL_SIZE + PACKET_SIZE + 12] = 0xFF;
        buffer[CONTROL_SIZE + PACKET_SIZE + 13] = 0xFF;


        buffer[CONTROL_SIZE + PACKET_SIZE + 14] = 0xFF;
        buffer[CONTROL_SIZE + PACKET_SIZE + 15] = 0xFF;


        /* Send the packet */


        const result = await sendToDevice(DFU_DNLOAD, buffer);


        if (!result || (result && result.status !== 'ok')) return false;


        /* Check status */


        const status = await getStatus();


        if (typeof(status) !== 'number' || status !== STATUS_OKAY) return true;


        /* Update for next packet */


        start += PACKET_SIZE;


    }


    console.log("All packets sent");


    return true;


}

if (navigator.usb) {
    navigator.usb.onconnect = async () => {


        console.log("Connect");


        connectToDevice();


    };


    navigator.usb.ondisconnect = () => {


        device = null;


        console.log("Disconnect");

        
    };
}