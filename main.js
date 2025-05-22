import assemble from "./assembler.js";
import {arrayBufferToHex, HexWriter} from "./hex.js";
import {eraseDevice, programDevice, connectToDevice} from "./programmer.js";
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github_light_default");
editor.session.setMode("ace/mode/assembly");
document.getElementById("assembleButton").addEventListener("click", () => {
    window.localStorage.setItem('lastAssemble', editor.getValue());
    const asm = assemble(editor.getValue());
    const hw = new HexWriter();
    hw.writeBytes(asm);
    console.log(hw);
    // https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server
    const downloadElement = document.createElement('a');
    downloadElement.href = hw.createObjectURL();
    downloadElement.download = "asm_out.hex";
    
    downloadElement.style.display = 'none';
    document.body.appendChild(downloadElement);
    
    downloadElement.click();
    
    document.body.removeChild(downloadElement);
});
document.getElementById("loadPrevButton").addEventListener("click", () => {
    editor.setValue(window.localStorage.getItem('lastAssemble'), -1);
});
document.getElementById("saveButton").addEventListener("click", () => {
    window.localStorage.setItem('savedCode', editor.getValue());
});
document.getElementById("readButton").addEventListener("click", () => {
    editor.setValue(window.localStorage.getItem('savedCode'), -1);
});
if (navigator.usb) {
    document.getElementById("connectButton").addEventListener("click", connectToDevice);
    document.getElementById("loadButton").addEventListener("click", () => {
        window.localStorage.setItem('lastAssemble', editor.getValue());
        const asm = assemble(editor.getValue());
        console.log(arrayBufferToHex(asm));
        eraseDevice();
        programDevice(new Uint8Array(asm));
    });
}
else {
    document.getElementById("connectButton").disabled = true;
    document.getElementById("loadButton").disabled = true;
    document.getElementById("usbUnsupportedMsg").hidden = false;
}