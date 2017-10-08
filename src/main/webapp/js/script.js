'use strict';

const symbols = {};
const reverseDepends = {};

function addReverseDepends(from, expr) {

    if (from === undefined) {
        return;
    }

    const parts = expr.split(/(&&|!=|=|\(|\)|\|\||!)/g);

    parts.forEach(p => {
        if (p.match(/^[a-zA-Z0-9_]+$/)) {
            if (!(p in reverseDepends)) {
                reverseDepends[p] = {};
            }
            reverseDepends[p][from] = true;
        }
    });
}

window.Xpath = (function () {
    return {

        node: function (node, path) {
            const xml = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
            const result = xml.evaluate(path, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.resultType === XPathResult.FIRST_ORDERED_NODE_TYPE && result.singleNodeValue !== null) {
                return result.singleNodeValue;
            } else {
                return undefined;
            }
        },

        number: function (node, path) {
            const xml = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
            const result = xml.evaluate(path, node, null, XPathResult.NUMBER_TYPE, null);
            if (result.resultType === XPathResult.NUMBER_TYPE && !isNaN(result.numberValue)) {
                return result.numberValue;
            } else {
                return undefined;
            }
        },

        string: function (node, path) {
            const xml = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
            const result = xml.evaluate(path, node, null, XPathResult.STRING_TYPE, null);
            if (result.resultType === XPathResult.STRING_TYPE && result.stringValue !== '') {
                return result.stringValue;
            } else {
                return undefined;
            }
        },

        array: function (node, path) {
            let result = [], e;
            const xml = node.nodeType === Node.DOCUMENT_NODE ? node : node.ownerDocument;
            const raw = xml.evaluate(path, node, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
            if (raw.resultType === XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
                while ((e = raw.iterateNext()) !== null) {
                    result.push(e);
                }
            }
            return result;
        }

    };
})();

function evaluate(expr, allowStrings) {
    const Tokenizer = (function (text) {
        const states = {
            EOF: 'eof',
            STRING: 'string',
            SYMBOL: 'symbol',

            ERROR: 'error',
            OR: '||',
            AND: '&&',
            NOT: '!',
            EQUALS: '==',
            NOT_EQUALS: '!=',
            OPEN_BRACKETS: '(',
            CLOSE_BRACKETS: ')'
        };

        let s_val;
        let EOF = false;
        let pos = 0;

        function _getChar() {
            if (EOF || pos >= text.length) {
                EOF = true;
                return states.EOF;
            } else {
                return text.charAt(pos++);
            }
        }

        function _ungetChar() {
            pos -= 1;
        }

        function _isSymbolChar(c) {
            if (c === states.EOF) {
                return false;
            }
            return c.match(/[a-zA-Z0-9_]/);
        }

        function _next() {
            while (true) {
                let c = _getChar();
                if (c === states.EOF) {
                    return states.EOF;
                } else if (c === '\'' || c === '"') {
                    s_val = '';
                    c = _getChar();
                    while (c !== states.EOF && c !== '\'' && c !== '"') {
                        s_val += c;
                        c = _getChar();
                        if (c === '\\') {
                            c = _getChar();
                            s_val += c;
                            c = _getChar();
                        }
                    }
                    return states.STRING;
                } else if (_isSymbolChar(c)) {
                    s_val = c;
                    c = _getChar();
                    while (_isSymbolChar(c)) {
                        s_val += c;
                        c = _getChar();
                    }
                    _ungetChar();
                    return states.SYMBOL;
                } else if (c === '|') {
                    c = _getChar();
                    if (c !== '|') {
                        return states.ERROR;
                    } else {
                        return states.OR;
                    }
                } else if (c === '&') {
                    c = _getChar();
                    if (c !== '&') {
                        return states.ERROR;
                    } else {
                        return states.AND;
                    }
                } else if (c === '!') {
                    c = _getChar();
                    if (c === '=') {
                        return states.NOT_EQUALS;
                    } else {
                        _ungetChar();
                        return states.NOT;
                    }
                } else if (c === '=') {
                    return states.EQUALS;
                } else if (c === '(') {
                    return states.OPEN_BRACKETS;
                } else if (c === ')') {
                    return states.CLOSE_BRACKETS;
                } else if (c.match(/\s/)) {
                    // skip whitespace.
                } else {
                    throw new Error('Unexpected character');
                }
            }
        }

        function _getString() {
            return s_val;
        }

        return Object.assign({
            next: _next,
            str: _getString
        }, states);

    })(expr);

    const operators = {};
    operators[Tokenizer.EQUALS] = {
        prec: 1, ass: 'left', exec: function (a, b) {
            return (a === b ? 2 : 0);
        }, args: 2
    };
    operators[Tokenizer.NOT_EQUALS] = {
        prec: 2, ass: 'left', exec: function (a, b) {
            return (a === b ? 0 : 2);
        }, args: 2
    };
    operators[Tokenizer.NOT] = {
        prec: 3, ass: 'right', exec: function (a) {
            return 2 - a;
        }, args: 1
    };
    operators[Tokenizer.AND] = {
        prec: 4, ass: 'left', exec: function (a, b) {
            return Math.min(a, b);
        }, args: 2
    };
    operators[Tokenizer.OR] = {
        prec: 5, ass: 'left', exec: function (a, b) {
            return Math.max(a, b);
        }, args: 2
    };

    function _valueize(arg) {
        if (typeof arg === 'object') {
            arg = arg.value;
        }

        if (arg === undefined) {
            arg = 0;
        }

        if (allowStrings) {
            return arg;
        } else if (typeof arg === 'string') {
            return Entry.numberToExpr(arg);
        }
    }

    function _apply(op) {
        const args = [];
        for (let i = 0; i < op.args; i += 1) {
            args.push(_valueize(outputStack.pop()));
        }
        return op.exec.apply(null, args);
    }

    let current, op1, op2;
    const outputStack = [];
    const operatorStack = [];

    while (true) {
        current = Tokenizer.next();
        if (current === Tokenizer.EOF) {
            break;
        } else if (current === Tokenizer.SYMBOL) {
            current = Tokenizer.str();
            if (current in symbols) {
                outputStack.push(symbols[current]);
            } else {
                outputStack.push(current);
            }
        } else if (current === Tokenizer.STRING) {
            outputStack.push(Tokenizer.str());
        } else if (current in operators) {
            if (operatorStack.length > 0) {
                op1 = operators[current];
                op2 = operatorStack[operatorStack.length - 1];
                while (op2 in operators &&
                    operators[op2].ass === 'left' &&
                    operators[op2].prec <= op1.prec
                    ) {
                    outputStack.push(_apply(operators[operatorStack.pop()]));
                    op2 = operatorStack[operatorStack.length - 1];
                }
            }
            operatorStack.push(current);
        } else if (current === Tokenizer.OPEN_BRACKETS) {
            operatorStack.push(current);
        } else if (current === Tokenizer.CLOSE_BRACKETS) {
            while (operatorStack[operatorStack.length - 1] !== Tokenizer.OPEN_BRACKETS) {
                outputStack.push(operatorStack.pop());
            }
            operatorStack.pop();
        } else {
            throw new Error('Unknown token', current);
        }
    }

    while (operatorStack.length > 0) {
        outputStack.push(_apply(operators[operatorStack.pop()]));
    }

    return _valueize(outputStack.pop());
}

class Conditional {
    constructor(value, condition) {
        this.value = value;
        this.condition = condition;
    }

    get test() {
        if (this.condition !== null) {
            return evaluate(this.condition);
        }
        return true;
    }
}

class Entry {

    static numberToExpr(num) {
        if (typeof num === 'number') {
            num = num.toString();
        }
        switch (num) {
            default:
            case '0':
                return 'n';
            case '1':
                return 'm';
            case '2':
                return 'y';
        }
    }

    constructor(node, parent) {
        const strings = ['prompt', 'help', 'symbol', 'type', 'env'];
        const lists = {
            'selects': 'selects/select',
            'implies': 'implies/imply',
            'defaults': 'defaults/default',
            'ranges': 'ranges/range'
        };

        let scratch;

        if (parent !== undefined) {
            this.parent = parent;
        }

        this.location = {
            file: node.getAttribute('file'),
            line: node.getAttribute('line')
        };

        strings.forEach(name => {
            scratch = Xpath.string(node, name);
            if (scratch !== undefined) {
                this[name] = scratch;
            }
        });

        for (let list in lists) {
            let scratch = Xpath.array(node, lists[list]);
            if (scratch.length > 0) {
                this[list] = [];
                scratch.forEach(x => this[list].push(new Conditional(x.firstChild.nodeValue, x.getAttribute('if'))));
            }
        }

        scratch = Xpath.array(node, 'depends/condition');
        if (scratch.length > 0) {
            this.depends = '';
            for (let i = 0; i < scratch.length; i += 1) {
                let expr = scratch[i].firstChild.nodeValue;
                addReverseDepends(this['symbol'], expr);
                if (i > 0) {
                    this.depends += '&&';
                }
                this.depends += expr;
            }
        }

        if ('env' in this) {
            this.val = this['env'];
        }

        if ('symbol' in this) {
            if (this['symbol'] in symbols) {

                const original = symbols[this['symbol']];

                strings.forEach(name => {
                    if (name in this && !(name in original)) {
                        original[name] = this[name];
                    }
                });

                Object.keys(lists).forEach(m => {
                    if (m in this) {
                        if (m in original) {
                            for (let i = 0; i < this[m].length; i += 1) {
                                const potentialDuplicate = this[m][i];
                                if (!original[m].includes(potentialDuplicate)) {
                                    original[m].push(potentialDuplicate);
                                }
                            }
                        } else {
                            original[m] = this[m];
                        }
                    }
                });

                if ('depends' in this) {
                    if ('depends' in original) {
                        original.depends += '&&' + this.depends;
                    } else {
                        original.depends = this.depends;
                    }
                }

                return original;
            }
            symbols[this['symbol']] = this;
        }
    }

    get isVisible() {
        return 'prompt' in this && (!('depends' in this) || evaluate(this.depends));
    }

    get default() {
        if ('defaults' in this) {
            for (let i = 0; i < this["defaults"].length; i += 1) {
                if (this['defaults'][i].test) {
                    return evaluate(this['defaults'][i].value, true);
                }
            }
        } else {
            return undefined;
        }
    }

    get value() {
        if ('val' in this && this.val !== undefined) {
            return this.val;
        } else {
            return this.default;
        }
    }

    set value(x) {
        this.val = x;

        this.updateDependencies();
    }

    _handleInputChange() {
        switch (this['type']) {
            case 'bool':
            case 'tristate':
                this._input.querySelectorAll('input').forEach(i => {
                    if (i.checked) {
                        this.val = Entry.numberToExpr(i.value);
                    }
                });
                break;
            default:
                this.val = this._input.querySelector('input').value;
                break;
        }

        this.updateDependencies();
    }

    updateDependencies() {

        if ('selects' in this) {
            this['selects'].forEach(y => {
                if (y.test && y.value in symbols) {
                    symbols[y.value].value = this.val;
                }
            });
        }

        if ('_input' in this) {
            const input = this._input;
            switch (this['type']) {
                case 'bool':
                case 'tristate':
                    input.querySelectorAll('input').forEach(i => {
                        i.checked = parseInt(i.value, 10) === evaluate(this.val);
                    });
                    break;

                default:
                    if (input.type === "number" && isNaN(this.val)) {
                        throw new Error("Not a valid number");
                    }
                    input.value = this.val;
                    break;
            }
        }

        if ('symbol' in this && this['symbol'] in reverseDepends) {
            Object.keys(reverseDepends[this['symbol']]).forEach(symbol => {
                const div = document.getElementById(symbol);
                if (div !== null) {
                    if (!symbols[symbol].isVisible) {
                        div.classList.add('invisible');
                    } else {
                        div.classList.remove('invisible');
                    }
                }
            });
        }
    }

    static _buildRadioInput(name, labels, value) {
        const div = buildElement('div');

        if (value === undefined) {
            value = 0;
        }

        for (let i = 0; i < labels.length; i += 1) {
            if (labels[i] === undefined) {
                continue;
            }
            const input = buildElement('input');
            input.type = 'radio';
            input.name = name;
            input.value = i;
            if (value === i) {
                input.checked = true;
            }

            div.appendChild(buildElement('label', undefined, input, labels[i]));
        }

        return div;
    }

    static _buildStringInput(name, type, value) {
        const input = buildElement('input');
        input.name = name;
        input.value = value;
        switch (type) {
            case 'hex':
                input.type = 'text';
                input.pattern = '[a-f0-9]+';
                break;
            case 'int':
                input.type = 'number';
                input.step = 1;
                break;
            default:
                input.type = 'text';
                break;
        }
        return input;
    }

    _buildHeader() {
        const header = buildElement('div', 'entry-header', this['prompt']);

        if ('symbol' in this) {
            header.appendChild(buildElement('div', 'symbol', this['symbol']));
        }

        if ('entries' in this) {
            header.appendChild(buildElement('div', 'expander', '+'));
        }

        if ('type' in this) {
            switch (this['type']) {
                case 'bool':
                    this._input = Entry._buildRadioInput(this['symbol'], ['No', undefined, 'Yes'], this.value);
                    break;
                case 'tristate':
                    this._input = Entry._buildRadioInput(this['symbol'], ['No', 'Module', 'Yes'], this.value);
                    break;
                default:
                    this._input = Entry._buildStringInput(this['symbol'], this['type'], this.value);
                    break;
            }

            this._input.addEventListener('change', this._handleInputChange.bind(this));
            header.appendChild(this._input);
        }
        return header;
    }

    _buildDisplayBody() {
        const body = buildElement('div', 'entry-body');

        if ('help' in this) {
            body.appendChild(buildElement('div', 'entry-help', this['help']));
        }

        return body;
    }

    buildDisplay() {
        const entry = buildElement('div', 'entry ' + this.constructor.name,
            this._buildHeader(),
            this._buildDisplayBody()
        );

        if ('symbol' in this) {
            entry.id = this['symbol'];
        }

        if (!this.isVisible) {
            entry.classList.add('invisible');
        }

        return entry;
    }
}

class Menu extends Entry {
    constructor(node, parent) {
        super(node, parent);

        if (this.constructor.name === 'MenuConfig') {
            return;
        }

        let scratch, i, mc;

        this.entries = [];
        scratch = Xpath.array(node, 'entries/*');
        for (i = 0; i < scratch.length; i += 1) {
            switch (scratch[i].nodeName) {
                case 'menu':
                    this.entries.push(new Menu(scratch[i], this));
                    break;
                case 'menuconfig':
                    mc = new MenuConfig(scratch[i], this);
                    i += mc.childCount;
                    this.entries.push(mc);

                    break;
                default:
                    this.entries.push(new Entry(scratch[i], this));
                    break;
            }
        }
    }

    _expansionHandler() {
        const list = this._list;

        if (list.classList.contains('empty')) {
            if ('entries' in this) {
                if (this.entries.length > 0) {
                    this.entries.forEach(e => list.appendChild(e.buildDisplay()));
                    list.classList.remove('empty');
                }
            }
        } else {
            while (list.firstChild) {
                list.removeChild(list.firstChild);
            }
            list.classList.add('empty');
        }
    }

    buildDisplay() {
        const entry = super.buildDisplay();

        entry.querySelector('.expander').addEventListener('click', this._expansionHandler.bind(this));

        return entry;
    }

    _buildDisplayBody() {
        const body = buildElement('div', 'entry-body');

        if ('help' in this) {
            body.appendChild(buildElement('div', 'entry-help', this['help']));
        }

        if (this.entries.length > 0) {
            this._list = buildElement('div', 'entry-list empty');
            this._list.dataset.symbol = this.symbol;

            body.appendChild(this._list);
        }

        return body;
    }
}

class MenuConfig extends Menu {
    constructor(node, parent) {
        super(node, parent);

        let mc, i;

        this.entries = [];

        let next = node.nextSibling;
        while (next !== null && Xpath.number(next, 'count(depends[condition = \'' + this.symbol + '\'])') > 0) {
            switch (next.nodeName) {
                case 'menu':
                    this.entries.push(new Menu(next, this));
                    break;
                case 'menuconfig':
                    mc = new MenuConfig(next, this);
                    for (i = 0; i < mc.childCount; i += 1) {
                        // Note, take one off the number of entries because we
                        // get next's next sibling at the end of the loop anyway.
                        next = next.nextSibling;
                    }

                    this.entries.push(mc);
                    break;
                default:
                    this.entries.push(new Entry(next, this));
                    break;
            }
            next = next.nextSibling;
        }
    }

    get childCount() {
        let count = 0, i;

        for (i = 0; i < this.entries.length; i += 1) {
            count += 1;
            if (this.entries[i] instanceof MenuConfig) {
                count += this.entries[i].childCount;
            }
        }

        return count;
    }
}

function buildMenu(node) {
    return new Menu(node);
}

function parse(xml) {
    const holder = document.getElementById('holder');

    const top = buildMenu(Xpath.node(xml, '/menu'));

    top.entries.forEach(e => {
        holder.appendChild(e.buildDisplay());
    });

    console.log("Parse complete");
}

function setValuesFromFile(e) {
    const reader = new FileReader();
    reader.onload = function (e2) {
        const text = e2.target.result;

        text.split(/\n/g).forEach(line => {
            const match = line.match(/^CONFIG_([a-zA-Z0-9_]+)=(.+)$/);
            if (match) {
                const symbolName = match[1];

                if (symbolName in symbols) {
                    const symbol = symbols[symbolName];
                    const value = match[2];

                    if (!("type" in symbol)) {
                        throw new Error("Missing type");
                    }

                    switch (symbol["type"]) {
                        case "bool":
                        case "tristate":
                            symbol.value = value;
                            break;
                        case "string":
                            symbol.value = value.replace(/(["'])(.+)\1/, '$2');
                            break;
                        case "int":
                            symbol.value = parseInt(value, 10);
                            break;
                        case "hex":
                            symbol.value = parseInt(value, 16);
                            break;
                        default:
                            throw new Error("Unknown type");
                    }
                }
            }
        });
    };

    reader.readAsText(e.target.files[0]);
}

window.addEventListener('load', function () {
    xhr({url: 'xml/linux-4.13.xml', format: 'xml'}).then(parse);

    document.getElementById('configFile').addEventListener('change', setValuesFromFile);
});


