define("ace/mode/assembly_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"], function(require, exports, module){
"use strict";
var oop = require("../lib/oop");
var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;
var AssemblyHighlightRules = function () {
    this.$rules = { start: [{ token: 'keyword.control.assembly',
                regex: '\\b(?:' + require("assembler.js").instructions.join('|') + ')\\b',
                caseInsensitive: true },
            { token: 'variable.parameter.register.assembly',
                regex: '\\b(?:r[12]?[0-9]|r3[01])\\b',
                caseInsensitive: true },
            { token: 'constant.character.decimal.assembly',
                regex: '\\b[0-9]+\\b' },
            { token: 'constant.character.hexadecimal.assembly',
                regex: '\\b0x[A-F0-9]+\\b',
                caseInsensitive: true },
            { token: ['text',
                    'support.function.directive.assembly',
                    'text',
                    'entity.name.function.assembly'],
                regex: '(\\s*)(%define)\\b( ?)((?:[_a-zA-Z0-9]*)?)',
                caseInsensitive: true },
            { token: 'entity.name.function.assembly', regex: '^[\\w.]+?:' },
            { token: 'comment.assembly', regex: ';.*$' }]
    };
    this.normalizeRules();
};
AssemblyHighlightRules.metaData = { fileTypes: ['asm'],
    name: 'Assembly',
    scopeName: 'source.assembly' };
oop.inherits(AssemblyHighlightRules, TextHighlightRules);
exports.AssemblyHighlightRules = AssemblyHighlightRules;

});

define("ace/mode/assembly",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/assembly_highlight_rules","ace/mode/folding/coffee"], function(require, exports, module){
"use strict";
var oop = require("../lib/oop");
var TextMode = require("./text").Mode;
var AssemblyHighlightRules = require("./assembly_highlight_rules").AssemblyHighlightRules;
//var FoldMode = require("./folding/coffee").FoldMode;
var Mode = function () {
    this.HighlightRules = AssemblyHighlightRules;
    //this.foldingRules = new FoldMode();
    this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);
(function () {
    this.lineCommentStart = [";"];
    this.$id = "ace/mode/assembly";
}).call(Mode.prototype);
exports.Mode = Mode;

});                (function() {
                    window.require(["ace/mode/assembly"], function(m) {
                        if (typeof module == "object" && typeof exports == "object" && module) {
                            module.exports = m;
                        }
                    });
                })();
            