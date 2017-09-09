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

function parse(xml) {
    "use strict";

    var entries = {};

    function xpathNode(node, path) {
        var result = xml.evaluate(path, node, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.resultType === XPathResult.FIRST_ORDERED_NODE_TYPE && result.singleNodeValue !== null) {
            return result.singleNodeValue;
        } else {
            return undefined;
        }
    }

    function xpathNumber(node, path) {
        var result = xml.evaluate(path, node, null, XPathResult.NUMBER_TYPE, null);
        if (result.resultType === XPathResult.NUMBER_TYPE && !isNaN(result.numberValue)) {
            return result.numberValue;
        } else {
            return undefined;
        }
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

    function applySelects(node, value) {
        var i, condition, select, target;
        var selects = xpathArray(node, "selects/select");
        for (i = 0; i < selects.length; i += 1) {
            select = selects[i];
            target = undefined;
            if (select.hasAttribute("if")) {
                condition = evaluate(select.getAttribute("if"));
                if (condition > 0) {
                    target = select.firstChild.nodeValue;
                }
            } else {
                target = select.firstChild.nodeValue;
            }
            if (target !== undefined) {
                if (target in entries) {
                    entries[target].value = value;
                } else {
                    entries[target] = {value: value, symbol: target};
                }
            }
        }
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
        var strings = ["symbol", "type", "value"];
        var result = {};

        for (i = 0; i < strings.length; i += 1) {
            scratch = xpathString(node, strings[i]);
            if (scratch !== undefined) {
                result[strings[i]] = scratch;
            }
        }

        result.location = node.getAttribute("file") + ": " + node.getAttribute("line");

        scratch = calculateDefault(node);
        if (scratch !== undefined) {
            result.value = scratch;
        }

        applySelects(node, result.value);

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

        scratch = xpathNode(node, "prompt");
        if (scratch !== undefined) {
            result.prompt = {text: scratch.firstChild.nodeValue};
            if (scratch.hasAttribute("if")) {
                result.prompt.condition = scratch.getAttribute("if");
            }
        }

        result.isVisible = function () {
            if ("prompt" in result) {
                if ("condition" in result.prompt) {
                    return evaluate(result.prompt.condition) > 0;
                } else {
                    return true;
                }
            } else {
                return false;
            }
        };

        if (!(result.symbol in entries)) {
            entries[result.symbol] = result;
        } else {
            Object.assign(entries[result.symbol], result);
        }
        return result;
    }

    function joinDepends(node) {
        var depends = xpathArray(node, "depends/condition");
        var i;
        var result = "";

        for (i = 0; i < depends.length; i += 1) {
            if (i !== 0) {
                result += "&&";
            }
            result += depends[i].firstChild.nodeValue;
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

    function buildConfig(node) {
        var result;
        var config = parseConfig(node);

        result = buildElement("div", "config");

        result.dataset.depends = joinDepends(node);

        if (!config.isVisible()) {
            result.classList.add("hidden");
        }

        if ("prompt" in config) {
            result.appendChild(buildElement("div", "prompt", config.prompt.text));
        }

        result.appendChild(
                buildElement("div", "header",
                        buildElement("div", "symbol", config.symbol),
                        buildElement("div", "type", config.type),
                        buildElement("div", "location", config.location)
                        )
                );

        result.appendChild(showDepends(node));

        if ("help" in config) {
            result.appendChild(
                    buildElement("div", "help hidden", config.help)
                    );
        }

        return result;
    }

    function showChoice(node) {

    }

    function buildComment(node) {
        var div = buildElement("div", "comment",
                buildElement("div", "prompt", xpathString(node, "prompt")),
                showDepends(node)
                );

        div.dataset.depends = joinDepends(node);
        return div;
    }

    function buildMenuConfig(node) {
        var div, menuconfig, next, scratch, offset, children;

        offset = 0;

        menuconfig = parseConfig(node);

        if (!(menuconfig.symbol in entries)) {
            entries[menuconfig.symbol] = menuconfig;
        } else {
            Object.assign(entries[menuconfig.symbol], menuconfig);
        }

        div = buildElement("div", "menuconfig");
        div.dataset.depends = joinDepends(node);

        if (!menuconfig.isVisible()) {
            div.classList.add("hidden");
        }

        if ("prompt" in menuconfig) {
            div.appendChild(buildElement("div", "prompt", menuconfig.prompt.text));
        }

        div.appendChild(
                buildElement("div", "header",
                        buildElement("div", "symbol", menuconfig.symbol),
                        buildElement("div", "type", menuconfig.type),
                        buildElement("div", "location", menuconfig.location)
                        )
                );

        if ("help" in menuconfig) {
            div.appendChild(
                    buildElement("div", "help hidden", menuconfig.help)
                    );
        }

        children = buildElement("div", "children hidden");
        next = node.nextSibling;
        OUTER: while (next !== null && xpathNumber(next, "count(depends/condition['" + menuconfig.symbol + "'])") > 0) {
            offset += 1;
            switch (next.nodeName) {
                case "config":                       
                    children.appendChild(buildConfig(next));
                    break;
                case "comment":
                    children.appendChild(buildComment(next));
                    break;
                case "choice":
                    // ignored.
                    break;
                case "menuconfig":
                    scratch = buildMenuConfig(next);
                    children.appendChild(scratch[0]);  
                    next = scratch[2];
                    continue;
                    break;
                case "menu":
                    children.appendChild(buildMenu(next, true));
                    break;
                default:  
                    console.log("Skipping " + next.nodeName);
                    
                    break;
            }
            next = next.nextSibling;
        }
        if (children.childNodes.length > 0) {
            div.appendChild(children);
        }
        return [div, offset, next];
    }

    function buildMenu(node, child) {
        var i, menu, prompt, entries, next, help, scratch, children;
        menu = buildElement("div", "menu");
        menu.dataset.depends = joinDepends(node);

        if (child !== undefined) {
            menu.classList.add("hidden");
        }

        prompt = xpathString(node, "prompt");
        menu.appendChild(buildElement("div", "caption", prompt !== undefined ? prompt : "Unlabled menu"));

        help = xpathString(node, "help");
        if (help !== undefined) {
            menu.appendChild(buildElement("div", "help", help));
        }

        children = buildElement("div", "children");
        entries = xpathArray(node, "entries/*");
        for (i = 0; i < entries.length; i += 1) {
            next = entries[i];

            switch (next.nodeName) {
                case "comment":
                    children.appendChild(buildComment(next));
                    break;
                case "config":
                    children.appendChild(buildConfig(next));
                    break;
                case "menuconfig":
                    scratch = buildMenuConfig(next);
                    children.appendChild(scratch[0]);
                    i += scratch[1];
                    break;
                case "menu":
                    children.appendChild(buildMenu(next, true));
                    break;
            }
        }
        if (children.childNodes.length > 0) {
            menu.appendChild(children);
        }
        return menu;
    }


    document.querySelector("#holder").appendChild(buildMenu(xpathNode(xml, "/menu")));
}

window.addEventListener("load", function () {
    xhr({url: "xml/linux-4.13.xml", format: "xml"}).then(parse);
});
