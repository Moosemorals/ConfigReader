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

    function evaluate(depends) {
        var operators = {
            "=": {prec: 1, ass: "left"},
            "!=": {prec: 2, ass: "left"},
            "!": {prec: 3, ass: "right"},
            "&&": {prec: 4, ass: "left"},
            "||": {prec: 5, ass: "left"}
        };
        
        var parts = depends.split(/(&&|!=|=|\(|\)|\|\||!)/g);
        var current, op1, op2;
        var outputQueue = [];
        var operatorStack = [];

        while (parts.length > 0) {
            current = parts.shift();
            if (current === "") {
                continue;
            } else if (current.match(/^[A-Za-z0-9_]+$/)) {
                outputQueue.push(current);
            } else if (current in operators) {
                if (operatorStack.length > 0) {
                    op1 = operators[current];
                    op2 = operatorStack[operatorStack.length - 1];
                    while (op2 in operators &&
                            operators[op2].ass === "left" &&
                            operators[op2].prec <= op1.prec
                            ) {
                        outputQueue.push(operatorStack.pop());
                        op2 = operatorStack[operatorStack.length - 1];
                    }
                }
                operatorStack.push(current);
            } else if (current === "(") {
                operatorStack.push(current);
            } else if (current === ")") {
                while (operatorStack[operatorStack.length - 1] !== "(") {
                    outputQueue.push(operatorStack.pop());
                }
                operatorStack.pop();
            } else {
                console.error("Unknown token", current);
            }
        }
        while (operatorStack.length > 0) {
            outputQueue.push(operatorStack.pop());
        }

        console.log(depends, outputQueue);
    }

    function parseConfig(node) {
        var i;
        var strings = ["symbol", "type", "prompt", "value", "default"];
        var result = {};

        for (i = 0; i < strings.length; i += 1) {
            result[strings[i]] = xpathString(node, strings[i]);
        }

        if ("default" in result) {
            result.value = evaluate(result.default);
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
            evaluate(result.depends);            
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
        } else if (next.nodeName === "menu") {
            queue = queue.concat(xpathArray(next, "entries/*"));
        }
    }

    console.log(Object.keys(entries).length);
}

window.addEventListener("load", function () {
    xhr({url: "xml/linux-4.13.xml", format: "xml"}).then(parse);
});
