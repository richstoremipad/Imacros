/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

// Some utility functions


(function() {
    if (typeof(Function.prototype.bind) == "undefined") {
        Function.prototype.bind = function(obj) {
            var method = this;
            return  function() {
                return method.apply(obj, arguments);
            };
        };
    }
    if (typeof(Array.prototype.indexOf) == "undefined") {
        Array.prototype.indexOf = function(x) {
            var a = this;
            for (var i = 0; i < a.length; i++)
                if (a[i] === x)
                    return i;
            return -1;
        };
    }
    if (typeof(Array.prototype.forEach) == "undefined") {
        // the code of this function was taken from
        // https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Global_Objects/Array/forEach
        Array.prototype.forEach = function(func /*, thisp*/) {
            var len = this.length >>> 0;
            if (typeof func != "function")
                throw new TypeError();

            var thisp = arguments[1];
            for (var i = 0; i < len; i++) {
                if (i in this)
                    func.call(thisp, this[i], i, this);
            }
        };
    }
}) ();


function $(id, win) {
    return (win || window).document.getElementById(id);
}


function __obj2str(obj) {
    var s = new Array();
    for(var i in obj) {
        var tmp = "";
        if (typeof(obj[i]) == "object")
            tmp = __obj2str(obj[i]);
        else if (typeof(obj[i]) == "function")
            tmp = "[function]";
        else 
            tmp = obj[i].toString();

        s.push(i+": "+tmp);
    }
    
    return "{"+s.join(", ")+"}";
}


// write to javascript console
function __loginf(msg) {
    console.log(msg.toString());
}


// Open URL in a new window
function link(url) {
    window.open(url);
}


// Returns number if and only if num is
// a string representation of a number,
// otherwise returns NaN
function __int(num) {
    var s = num.toString();
    s = im_StrHelper.trim(s);
    if (!s.length)
        return Number.NaN;
    var n = parseInt(s);
    if (n.toString().length != s.length)
        return Number.NaN;
    return n;
}



im_StrHelper = {

    // escape \n, \t, etc. chars in line
    escapeLine: function(line) {
        var values_to_escape = {
                "\\u005C": "\\\\",
                "\\u0000": "\\0",
                "\\u0008": "\\b",
                "\\u0009": "\\t",
                "\\u000A": "\\n",
                "\\u000B": "\\v",
                "\\u000C": "\\f",
                "\\u000D": "\\r",
                "\\u0022": "\\\"",
                "\\u0027": "\\'"};

        // var values_to_escape = {
        //         "\\": "\\\\",
        //         "\0": "\\0",
        //         "\b": "\\b",
        //         "\t": "\\t",
        //         "\n": "\\n",
        //         "\v": "\\v",
        //         "\f": "\\f",
        //         "\r": "\\r",
        //         "\"": "\\\"",
        //         "'": "\\'"};
        
        for (var x in values_to_escape) {
            line = line.replace(new RegExp(x, "g"), values_to_escape[x]);
        }

        return line;
    },

    // replace all white-space symbols by <..>
    wrapLine: function (line) {
        const line_re = new RegExp("^\"((?:\n|.)*)\"$");

        if (line.match(line_re)) { // it is a quoted string
            line = this.escapeLine(line);
            
            // add quotes
            line = "\""+line+"\"";
        } else {
            line = line.replace(/\t/g, "<SP>");
            line = line.replace(/\n/g, "<BR>");
            line = line.replace(/\r/g, "<LF>");
            line = line.replace(/\s/g, "<SP>");
        }

        return line;
    },


    // Unwraps a line 
    // If the line is a quoted string then the following escape sequences
    // are translated:
    // \0 The NUL character (\u0000).
    // \b Backspace (\u0008).
    // \t Horizontal tab (\u0009).
    // \n Newline (\u000A).
    // \v Vertical tab (\u000B).
    // \f Form feed (\u000C).
    // \r Carriage return (\u000D).
    // \" Double quote (\u0022).
    // \' Apostrophe or single quote (\u0027).
    // \\ Backslash (\u005C).
    // \xXX The Latin-1 character specified by the two hexadecimal digits XX.
    // \uXXXX Unicode character specified by the four hexadecimal digits XXXX.
    // Otherwise <BR>, <LF>, <SP> are replaced by \n, \r, \x31 resp.

    unwrapLine: function (line) {
        const line_re = new RegExp("^\"((?:\n|.)*)\"$");
        var m = null;
        if (m = line.match(line_re)) {
            line = m[1];        // 'unquote' the line
            // replace escape sequences by their value
            var escape_values = {
                "0": "\u0000",
                "b": "\u0008",
                "t": "\u0009",
                "n": "\u000A",
                "v": "\u000B",
                "f": "\u000C",
                "r": "\u000D",
                "\"": "\u0022",
                "\'": "\u0027",
                "\\\\": "\u005C" };
            for (var x in escape_values)
                line = line.replace(new RegExp("\\\\"+x, "g"),
                                    escape_values[x]);
            // function to replace \x|u sequence
            var replaceChar = function (match_str, char_code) {
                return String.fromCharCode(parseInt("0x"+char_code));
            };
            // replace \xXX by its value
            line = line.replace(/\\x([\da-fA-F]{2})/g, replaceChar);
            // replace \uXXXX by its value
            line = line.replace(/\\u([\da-fA-F]{4})/g, replaceChar);
        } else {
            line = line.replace(/<br>/gi, '\n');
            line = line.replace(/<lf>/gi, '\r');
            line = line.replace(/<sp>/gi, ' ');
        }

        return line;
    },
    
    formatDateString: function(str, date) {
        var  prependDate = function(str, num) {
            str = str.toString(); 
            var x = __int(str), y = __int(num);
            if (isNaN(x) || isNaN(y))
                return;
            while (str.length < num)
                str = '0'+str;
            return str;
        };
        var now = date ? date : new Date();
        str = str.replace(/yyyy/g, prependDate(now.getFullYear(), 4));
        str = str.replace(/yy/g, now.getFullYear().toString().substr(-2));
        str = str.replace(/mm/g, prependDate(now.getMonth()+1, 2));
        str = str.replace(/dd/g, prependDate(now.getDate(), 2));
        str = str.replace(/hh/g, prependDate(now.getHours(), 2));
        str = str.replace(/nn/g, prependDate(now.getMinutes(), 2));
        str = str.replace(/ss/g, prependDate(now.getSeconds(), 2));

        return str;
    },
    
    // escape chars which are of special meaning in regexp
    escapeREChars: function(str) {
        var chars = "^$.+?=!:|\\/()[]{}", res = "", i, j;

        for ( i = 0; i < str.length; i++) {
            for (j = 0; j < chars.length; j++) {
                if (str[i] == chars[j]) {
                    res += "\\";
                    break;
                }
            }
            res += str[i];
        }

        return res;
    },

    escapeTextContent: function(str) {
        // 1. remove all leading/trailing white spaces
        str = this.trim(str);
        // 2. remove all linebreaks
        str = str.replace(/[\r\n]+/g, "");
        // 3. all consequent white spaces inside text are replaced by one
        str = str.replace(/\s+/g, " ");

        return str;
    },


    trim: function(s) {
        return s.replace(/^\s+/, "").replace(/\s+$/, "");
    }
};

var im_Clipboard = {
    _check_area: function(str) {
        var x;
        if (!(x = $("clipboard-area"))) {
            x = document.createElement("textarea");
            x.id = "clipboard-area";
            x.setAttribute("contentEditable", "true");
            document.body.appendChild(x);    
        }
        return x;
    },

    putString: function(str) {
        var x = this._check_area();
        x.value = str;
        x.focus();
        x.select();
        document.execCommand("Copy");
    },

    getString: function() {
        var x = this._check_area();
        x.focus();
        document.execCommand("Paste");
        
        return x.value;
    }
};


// App exceptions

// Classes for reporting syntax and runtime errors

// Returns error with message=msg and optional position of
// bad parameter set by num
function BadParameter(msg, num) {
    this.message = typeof(num) != "undefined" ? "expected "+msg+
        " as parameter "+num : msg;
    this.name = "BadParameter";
    this.errnum = 911;
}

BadParameter.prototype = Error.prototype;


function UnsupportedCommand(msg) {
    this.message = "command "+msg+" is not supported in the current version";
    this.name = "UnsupportedCommand";
    this.errnum = 912;
}

UnsupportedCommand.prototype = Error.prototype;

// Returns error with message=msg, optional error number num
// sets mplayer.errorCode
function RuntimeError(msg, num) {
    this.message = msg;
    if (typeof num != "undefined")
        this.errnum = num;
    this.name = "RuntimeError";
}

RuntimeError.prototype = Error.prototype;

