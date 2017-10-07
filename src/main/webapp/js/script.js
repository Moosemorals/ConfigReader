"use strict";

const symbols = {};

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
            if (result.resultType === XPathResult.STRING_TYPE && result.stringValue !== "") {
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

    }
})();

function evaluate(expr, allowStrings) {
    const operators = {
        "=": {
            prec: 1, ass: "left", exec: function (a, b) {
                return (a === b ? 2 : 0);
            }, args: 2
        },
        "!=": {
            prec: 2, ass: "left", exec: function (a, b) {
                return (a === b ? 0 : 2);
            }, args: 2
        },
        "!": {
            prec: 3, ass: "right", exec: function (a) {
                return 2 - a;
            }, args: 1
        },
        "&&": {
            prec: 4, ass: "left", exec: function (a, b) {
                return Math.min(a, b);
            }, args: 2
        },
        "||": {
            prec: 5, ass: "left", exec: function (a, b) {
                return Math.max(a, b);
            }, args: 2
        }
    };

    function _valueize(arg) {
        if (typeof arg === "object") {
            arg = arg.value;
        }

        if (arg === undefined) {
            arg = 0;
        }

        if (typeof arg === "string") {
            switch (arg) {
                case "y":
                    arg = 2;
                    break;
                case "m":
                    arg = 1;
                    break;
                default:
                    if (!allowStrings) {
                        arg = 0;
                    }
                    break;
            }
        }
        return arg;
    }

    function _apply(op) {
        const args = [];
        let i;
        for (i = 0; i < op.args; i += 1) {
            args.push(_valueize(outputStack.pop()));
        }
        return op.exec.apply(null, args);
    }

    const parts = expr.split(/(&&|!=|=|\(|\)|\|\||!)/g);
    let current, op1, op2;
    const outputStack = [];
    const operatorStack = [];

    while (parts.length > 0) {
        current = parts.shift();
        if (current === "") {
            continue;
        } else if (current.match(/^[A-Za-z0-9_]+$/)) {
            if (current in symbols) {
                outputStack.push(symbols[current]);
            } else {
                outputStack.push(current);
            }
        } else if (current.substring(0, 1) === '"' || current.substring(0, 1) === "'") {
            outputStack.push(current);
        } else if (current in operators) {
            if (operatorStack.length > 0) {
                op1 = operators[current];
                op2 = operatorStack[operatorStack.length - 1];
                while (op2 in operators &&
                    operators[op2].ass === "left" &&
                    operators[op2].prec <= op1.prec
                    ) {
                    outputStack.push(_apply(operators[operatorStack.pop()]));
                    op2 = operatorStack[operatorStack.length - 1];
                }
            }
            operatorStack.push(current);
        } else if (current === "(") {
            operatorStack.push(current);
        } else if (current === ")") {
            while (operatorStack[operatorStack.length - 1] !== "(") {
                outputStack.push(operatorStack.pop());
            }
            operatorStack.pop();
        } else {
            console.error("Unknown token", current);
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
    constructor(node, parent) {
        const strings = ["prompt", "help", "symbol", "type", "env"];
        let i, scratch;

        if (parent !== undefined) {
            this.parent = parent;
        }

        this.location = {
            file: node.getAttribute("file"),
            line: node.getAttribute("line")
        };

        for (i = 0; i < strings.length; i += 1) {
            scratch = Xpath.string(node, strings[i]);
            if (scratch !== undefined) {
                this[strings[i]] = scratch;
            }
        }

        if ("env" in this) {
            this.val = this.env;
        }

        scratch = Xpath.array(node, "depends/condition");
        if (scratch.length > 0) {
            this.depends = "";
            for (i = 0; i < scratch.length; i += 1) {
                if (i > 0) {
                    this.depends += "&&";
                }
                this.depends += scratch[i].firstChild.nodeValue;
            }
        }

        scratch = Xpath.array(node, "selects/select");
        if (scratch.length > 0) {
            this.selects = [];
            scratch.forEach(x => this.selects.push(new Conditional(x.firstChild.nodeValue, x.getAttribute("if"))));
        }

        scratch = Xpath.array(node, "implies/imply");
        if (scratch.length > 0) {
            this.implies = [];
            scratch.forEach(x => this.implies.push(new Conditional(x.firstChild.nodeValue, x.getAttribute("if"))));
        }

        scratch = Xpath.array(node, "defaults/default");
        if (scratch.length > 0) {
            this.defaults = [];
            scratch.forEach(x => this.defaults.push(new Conditional(x.firstChild.nodeValue, x.getAttribute("if"))));
        }

        if ("symbol" in this)  {
            if (this.symbol in symbols) {
             //   console.warn("Duplicate symbol", this);
            }
            symbols[this.symbol] = this;
        }
    }

    get isVisible() {
        return "prompt" in this && (!("depends" in this) || evaluate(this.depends));
    }

    get default() {
        if ("defaults" in this) {
            for (let i = 0; i < this.defaults.length; i += 1) {
                if (this.defaults[i].test) {
                    return evaluate(this.defaults[i].value, true);
                }
            }
        } else {
            return undefined;
        }
    }

    get value() {
        if ("val" in this && this.val !== undefined) {
            return this.val;
        } else {
            return this.default;
        }
    }

    set value(x) {
        this.val = x;

        if ("selects" in this) {
            this.selects.forEach(y => {
                if (y.test && y.value in symbols) {
                    symbols[y.value].value = x;
                }
            });
        }
    }

    toString() {
        let result = "";

        if ("prompt" in this) {
            result += '"' + this.prompt + "' ";
        }

        result += "(" + this.symbol + ": " + this.type + ")";

        return result;
    }
}

class Config extends Entry {
    constructor(node, parent) {
        super(node, parent);

    };
}

class Choice extends Entry {
    constructor(node, parent) {
        super(node, parent);
    }
}

class MenuConfig extends Entry {
    constructor(node, parent) {
        super(node, parent);

        let mc, i;

        this.entries = [];

        let next = node.nextSibling;
        while (next !== null && Xpath.number(next, "count(depends[condition = '" + this.symbol + "'])") > 0) {
            switch (next.nodeName) {
                case "menu":
                    this.entries.push(new Menu(next, this));
                    break;
                case "menuconfig":
                    mc = new MenuConfig(next, this);
                    for (i = 0; i < mc.childCount; i += 1) {
                        // Note, take one off the number of entries because we
                        // get next's next sibling at the end of the loop anyway.
                        next = next.nextSibling;
                    }

                    this.entries.push(mc);
                    break;
                case "config":
                    this.entries.push(new Config(next, this));
                    break;
                default:
                    this.entries.push(new Entry(next, this));
                    break;
            }
            next = next.nextSibling;
        };
    };

    get childCount() {
        let count = 0, i;

        for (i = 0; i < this.entries.length; i += 1) {
            count += 1
            if (this.entries[i] instanceof MenuConfig) {
                count += this.entries[i].childCount ;
            }
        }

        return count;
    }

    toString() {
        return super.toString() + " --> ";
    }
}

class Menu extends Entry {
    constructor(node, parent) {
        super(node, parent);

        let scratch, i, mc;

        this.entries = [];
        scratch = Xpath.array(node, "entries/*");
        for (i = 0; i < scratch.length; i += 1) {
            switch (scratch[i].nodeName) {
                case "menu":
                    this.entries.push(new Menu(scratch[i], this));
                    break;
                case "menuconfig":
                    mc = new MenuConfig(scratch[i], this);
                    i += mc.childCount ;
                    this.entries.push(mc);

                    break;
                case "config":
                    this.entries.push(new Config(scratch[i], this));
                    break;
                default:
                    this.entries.push(new Entry(scratch[i], this));
                    break;
            }
        }
    };

    toString() {
        return this.prompt + " --> ";
    }
}

function buildMenu(node) {
    return new Menu(node);
}

function parse(xml) {
    const holder = document.getElementById("holder");

    const top = buildMenu(Xpath.node(xml, "/menu"));

    top.entries.forEach(e => {
        if (e.isVisible) {
            holder.appendChild(buildElement("div", undefined,
                e.toString()
            ));
        }
    });

    debugger;
}

window.addEventListener("load", function () {
    xhr({url: "xml/linux-4.13.xml", format: "xml"}).then(parse);
});
