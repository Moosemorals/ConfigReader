/* 
 * Copyright (c) 2017, Osric Wilkinson (osric@fluffypeople.com)
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/* global xhr, getElements, XPathResult */

function display() {
    "use strict";

    var xml;

    function xpath(node, path, type) {
        if (type === undefined) {
            type = 0; // any
        }
        return xml.evaluate(path, node, null, type, null);
    }

    function xpathString(node, path) {
        var result = xml.evaluate(path, node, null, XPathResult.STRING_TYPE, null);
        if (result.resultType === XPathResult.STRING_TYPE && result.stringValue !== "") {
            return result.stringValue;
        } else {
            return undefined;
        }
    }

    function xpathArray(node, path) {
        var result = [], e, i;
        var raw = xml.evaluate(path, node, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        if (raw.resultType === XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
            while ((e = raw.iterateNext()) !== null) {
                result.push(e);
            }
        }
        return result;
    }


    function showDepends(node) {
        var i;
        var depends = xpathArray(node, "depends/condition");

        var result = buildElement("div", "depends");

        for (i = 0; i < depends.length; i += 1) {
            result.appendChild(buildElement("span", undefined, depends[i]));
        }

        return result;
    }

    function showConfig(node) {
        var config, symbol, prompt, help, type;
        config = buildElement("div", "config");

        symbol = xpathString(node, "symbol");
        type = xpathString(node, "type");
        prompt = xpathString(node, "prompt");
        help = xpathString(node, "help");

        config.appendChild(
                buildElement("div", "header",
                        buildElement("div", "symbol", symbol),
                        buildElement("div", "type", type),
                        )
                );
        if (prompt !== undefined) {
            config.appendChild(buildElement("div", "prompt", prompt));
        }

        config.appendChild(
                buildElement("div", "help", help)
                );

        config.appendChild(showDepends(node));

        return config;
    }

    function showChoice(node) {

    }

    function showComment(node) {
        return buildElement("div", "comment",
                buildElement("div", "prompt", xpathString(node, "prompt")),
                showDepends(node)
                );
    }

    function showMenu(node) {
        var i, menu, prompt, entries, entry, help;
        menu = buildElement("div", "menu");

        prompt = xpathString(node, "prompt");
        menu.appendChild(buildElement("div", "caption", prompt !== undefined ? prompt : "Unlabled menu"));

        help = xpathString(node, "help");
        if (help !== undefined) {
            menu.appendChild(buildElement("div", "help", help));
        }

        entries = xpathArray(node, "entries/*");
        for (i = 0; i < entries.length; i += 1) {
            entry = entries[i];
            switch (entry.nodeName) {
                case "menu":
                    //      menu.appendChild(showMenu(entry));
                    break;
                case "config":
                    menu.appendChild(showConfig(entry));
                    break;
                case "comment":
                    menu.appendChild(showComment(entry));
                    break;

            }
        }
        return menu;
    }
}

function parse(xml) {
    "use strict";

    function xpathString(node, path) {
        var result = xml.evaluate(path, node, null, XPathResult.STRING_TYPE, null);
        if (result.resultType === XPathResult.STRING_TYPE && result.stringValue !== "") {
            return result.stringValue;
        } else {
            return undefined;
        }
    }

    function xpathArray(node, path) {
        var result = [], e, i;
        var raw = xml.evaluate(path, node, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        if (raw.resultType === XPathResult.ORDERED_NODE_ITERATOR_TYPE) {
            while ((e = raw.iterateNext()) !== null) {
                result.push(e);
            }
        }
        return result;
    }

    function evaluate(expr, allowStrings) {
        var operators = {
            "=": {prec: 1, ass: "left", exec: function (a, b) {
                    return (a === b ? 2 : 0);
                }, args: 2},
            "!=": {prec: 2, ass: "left", exec: function (a, b) {
                    return (a === b ? 0 : 2);
                }, args: 2},
            "!": {prec: 3, ass: "right", exec: function (a) {
                    return 2 - a;
                }, args: 1},
            "&&": {prec: 4, ass: "left", exec: function (a, b) {
                    return Math.min(a, b);
                }, args: 2},
            "||": {prec: 5, ass: "left", exec: function (a, b) {
                    return Math.max(a, b);
                }, args: 2}
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
            var args = [], i, arg;
            for (i = 0; i < op.args; i += 1) {
                args.push(_valueize(outputStack.pop()));
            }
            return op.exec.apply(null, args);
        }

        var parts = expr.split(/(&&|!=|=|\(|\)|\|\||!)/g);
        var current, op1, op2;
        var outputStack = [];
        var operatorStack = [];

        while (parts.length > 0) {
            current = parts.shift();
            if (current === "") {
                continue;
            } else if (current.match(/^[A-Za-z0-9_]+$/)) {
                if (current in entries) {
                    outputStack.push(entries[current]);
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

    function calculateDefault(node) {
        var condition, def, i;
        var defaults = xpathArray(node, "defaults/default");
        for (i = 0; i < defaults.length; i += 1) {
            def = defaults[i];
            if (def.hasAttribute("if")) {
                condition = evaluate(def.getAttribute("if"));
                if (condition > 0) {
                    return evaluate(def.firstChild.nodeValue, true);
                }
            } else {
                return evaluate(def.firstChild.nodeValue, true);
            }
        }
        return undefined;
    }
    
    function numberToStr(num) {
        if (typeof num !== "number") {
            return num;
        }
        switch (num) {
            case "2":
                return "y";
            case "1":
                return "m";
            default:
                return "n";
        }
    }

    function parseConfig(node) {
        var i, scratch;
        var strings = ["symbol", "type", "prompt", "value"];
        var result = {};

        for (i = 0; i < strings.length; i += 1) {
            scratch = xpathString(node, strings[i]);
            if (scratch !== undefined) {
                result[strings[i]] = scratch;
            }
        }

        if (result.symbol === "KALLSYMS_ABSOLUTE_PERCPU") {
            debugger;
        }

        scratch = calculateDefault(node);
        if (scratch !== undefined) {            
            result.value = scratch;
        }

        var depends = xpathArray(node, "depends/condition");
        if (depends.length > 0) {
            result.depends = "";
            for (i = 0; i < depends.length; i += 1) {

                if (i > 0) {
                    result.depends += "&&";
                }
                result.depends += depends[i].firstChild.nodeValue;
            }
            result.visible = evaluate(result.depends);
        }
        return result;
    }

    var entries = {}, next;
    var queue = xpathArray(xml, "/menu/entries/*");
    while (queue.length > 0) {
        next = queue.shift();
        if (next.nodeName === "config") {
            next = parseConfig(next);
            entries[next.symbol] = next;
            if (next.visible > 0) {
            //    console.log(next.symbol, next.value);
            }
        } else if (next.nodeName === "menu") {
            queue = queue.concat(xpathArray(next, "entries/*"));
        }
    }

    console.log(Object.keys(entries).length);
}

window.addEventListener("load", function () {
    xhr({url: "xml/linux-4.13.xml", format: "xml"}).then(parse);
});
