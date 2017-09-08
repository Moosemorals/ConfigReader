/* 
 * The MIT License
 *
 * Copyright 2017 Osric Wilkinson (osric@fluffypeople.com).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

function pad(number, digits) {
    var result = number.toString();

    while (result.length < digits) {
        result = "0" + result;
    }

    return result;
}

function buildElement(tag, classes) {
    var el = document.createElement(tag);
    var i;
    if (classes) {
        classes = classes.split(/\s+/);
        for (i = 0; i < classes.length; i += 1) {
            if (classes[i]) {
                el.classList.add(classes[i]);
            }
        }
    }
    var index = 2;
    while (index < arguments.length) {

        switch (typeof arguments[index]) {
            case "undefined":
                // skip it
                break;
            case "string":
            case "number":
                el.appendChild(textNode(arguments[index]));
                break;
            default:
                el.appendChild(arguments[index]);
                break;
        }
        index += 1;
    }
    return el;
}

function getElements(selector) {
    var result = [], i;
    var nodeList = document.querySelectorAll(selector);
    if (nodeList !== null) {        
        for (i = 0; i < nodeList.length; i += 1) {
            result.push(nodeList[i]);
        }
    }
    if (result.length === 1) {
        return result[0];
    } else {
        return result;
    }
}

function removeElement(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}

function emptyElement(node) {
    while (node.hasChildNodes()) {
        node.removeChild(node.firstChild);
    }
}

function replaceContent(node, content) {
    emptyElement(node);
    node.appendChild(content);
}

function textNode(text) {
    return document.createTextNode(text);
}

/*
 * Function based on http://stackoverflow.com/a/30008115/195833
 * {
 *  method: String,
 *  url: String,
 *  param: Object,
 *  format: String,
 *  headers: Object
 * }
 * 
 */
function xhr(opts) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();

        // Setup defaults
        opts = Object.assign({method: "GET", format: 'json'}, opts);

        var params = opts.param;
        if (params && typeof params === 'object') {
            params = Object.keys(params).map(function (key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
            }).join('&');
            
            opts.url += "?" + params;            
        }

        xhr.open(opts.method, opts.url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                switch (opts.format) {
                    case "json":
                        resolve(JSON.parse(xhr.response));
                        break;
                    case "xml":
                        resolve(xhr.responseXML);
                        break;
                    default:
                        resolve(xhr.response);
                        break;
                }
                
            } else {
                reject({
                    status: this.status,
                    body: JSON.parse(xhr.response)
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                body: {error: "Can't " + opts.method + " " + opts.url}
            });
        };
        if (opts.headers) {
            Object.keys(opts.headers).forEach(function (key) {
                xhr.setRequestHeader(key, opts.headers[key]);
            });
        }

        if ("body" in opts) {
            xhr.send(opts.body);
        } else {
            xhr.send();
        }
    });
}

// Function from https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#Testing_for_support_vs_availability
function storageAvailable(type) {
    try {
        var storage = window[type], x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);
        return true;
    } catch (e) {
        return false;
    }
}
